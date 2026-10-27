import { dbConnect } from "@/backend/config/database";
import {
  InventoryItem,
  StockVoucher,
  type IStockVoucher,
  type IStockVoucherItem,
  type StockVoucherType,
} from "@/backend/models/Inventory";
import { AccountingCounter } from "@/backend/models/Accounting";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import type { SessionUser } from "@/backend/types";
import { recordAudit, getAuditTrail } from "@/backend/lib/audit";
import type { z } from "zod";
import type {
  inventorySchema,
  stockVoucherSchema,
} from "@/backend/validators/modules.validator";
import { accountingService } from "@/backend/services/accounting.service";
import { partyService } from "@/backend/services/party.service";
import { Account, Voucher as AccountingVoucher } from "@/backend/models/Accounting";

type InventoryInput = z.infer<typeof inventorySchema>;
type StockVoucherInput = z.infer<typeof stockVoucherSchema>;

/** Stock direction at the voucher branch: 1 = in, -1 = out, 0 = signed/transfer. */
const FLOW: Record<StockVoucherType, 1 | -1 | 0> = {
  purchase: 1,
  sales: -1,
  purchase_return: -1,
  sales_return: 1,
  transfer: -1,
  adjustment: 0,
};

const STOCK_PREFIX: Record<StockVoucherType, string> = {
  purchase: "PINV",
  sales: "SINV",
  purchase_return: "PRTN",
  sales_return: "SRTN",
  transfer: "STRF",
  adjustment: "SADJ",
};

function stockVoucherSnapshot(v: Record<string, unknown>) {
  return {
    number: v.number,
    voucherType: v.voucherType,
    status: v.status,
    date: v.date,
    narration: v.narration,
    partyName: v.partyName,
    branchCode: v.branchCode,
    toBranchCode: v.toBranchCode,
    grandTotal: v.grandTotal,
    items: v.items,
  };
}

/** How each posted stock voucher hits the ledger; transfers/adjustments stay off-book. */

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function statusFromQty(qty: number, reorder: number) {
  if (qty <= 0) return "out" as const;
  if (qty <= reorder) return "low" as const;
  return "in_stock" as const;
}

async function defaultBranch() {
  await dbConnect();
  const settings = await Settings.findOne().lean();
  return (settings?.defaultBranchCode || "MAIN").toUpperCase();
}

type StockDoc = {
  branchCode?: string;
  quantity: number;
  reorderLevel: number;
  status: string;
  stock: { branchCode: string; quantity: number }[];
};

/** Older items only carry a single total; move it into the branch buckets once. */
function ensureBuckets(item: StockDoc, fallbackBranch: string) {
  if (!item.stock?.length) {
    item.stock = [
      { branchCode: (item.branchCode || fallbackBranch).toUpperCase(), quantity: item.quantity || 0 },
    ];
  }
}

function bucketQty(item: StockDoc, branchCode: string) {
  return item.stock.find((row) => row.branchCode === branchCode)?.quantity ?? 0;
}

function moveBucket(item: StockDoc, branchCode: string, delta: number) {
  const row = item.stock.find((r) => r.branchCode === branchCode);
  if (row) row.quantity = round(row.quantity + delta);
  else item.stock.push({ branchCode, quantity: round(delta) });
  item.quantity = Math.max(0, round(item.stock.reduce((sum, r) => sum + r.quantity, 0)));
  item.status = statusFromQty(item.quantity, item.reorderLevel);
}

async function nextStockNumber(type: StockVoucherType, branchCode: string, date: Date) {
  const prefix = STOCK_PREFIX[type];
  const year = date.getFullYear();
  const branch = branchCode.toUpperCase();
  const counter = await AccountingCounter.findByIdAndUpdate(
    `${prefix}:${branch}:${year}`,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${branch}-${year}-${String(counter.seq).padStart(5, "0")}`;
}

/** Applies (sign 1) or reverses (sign -1) the stock movement of a voucher. */
async function applyStock(voucher: IStockVoucher, sign: 1 | -1) {
  const fallback = await defaultBranch();
  const from = voucher.branchCode.toUpperCase();
  const to = voucher.toBranchCode?.toUpperCase();
  const flow = FLOW[voucher.voucherType];

  for (const line of voucher.items) {
    const item = await InventoryItem.findById(line.itemId);
    if (!item) {
      throw new ServiceError("NOT_FOUND", `Item ${line.sku} no longer exists`, 404);
    }
    ensureBuckets(item, fallback);
    const qty = flow === 0 ? line.quantity : Math.abs(line.quantity) * flow;
    const delta = round(qty * sign);
    const moves: [string, number][] = [[from, delta]];
    if (voucher.voucherType === "transfer" && to) moves.push([to, -delta]);

    for (const [branch, amount] of moves) {
      if (amount < 0 && bucketQty(item, branch) + amount < 0) {
        const available = `${bucketQty(item, branch)} ${item.unit} at ${branch}`;
        throw new ServiceError(
          "VALIDATION",
          sign === -1
            ? `Cannot reverse: ${item.name} (${item.sku}) has only ${available} left, stock was already moved on`
            : `${item.name} (${item.sku}) has only ${available}`,
          400
        );
      }
    }
    for (const [branch, amount] of moves) moveBucket(item, branch, amount);
    if (voucher.voucherType === "purchase" && sign === 1 && line.rate > 0) {
      item.unitCost = line.rate;
    }
    await item.save();
  }
}

/** Cash / bank / party account the voucher is settled against. */
async function settlementCode(voucher: IStockVoucher) {
  const mode = voucher.paymentMode || "cash";
  if (mode === "credit") {
    if (!voucher.partyId || !voucher.partyType) {
      throw new ServiceError("VALIDATION", "Pick the supplier or customer for a credit voucher", 400);
    }
    return (await partyService.accountFor(voucher.partyType, voucher.partyId)).code;
  }
  if (voucher.settlementAccount) return voucher.settlementAccount;
  const acc = await Account.findOne({ systemKey: mode === "bank" ? "bank" : "cash" }).select("code").lean();
  if (!acc) throw new ServiceError("INTERNAL", "Cash/bank account is missing", 500);
  return acc.code as string;
}

async function systemCode(key: string) {
  const acc = await Account.findOne({ systemKey: key }).select("code").lean();
  if (!acc) throw new ServiceError("INTERNAL", `System account '${key}' is missing`, 500);
  return acc.code as string;
}

/**
 * Real double entry for stock documents:
 *  purchase        Dr Inventory (+ Input tax)          Cr Cash / Bank / Supplier
 *  purchase_return Dr Cash / Bank / Supplier           Cr Inventory (+ Input tax)
 *  sales           Dr Cash / Bank / Customer           Cr Sales of goods (+ Output tax)
 *                  Dr Cost of goods sold               Cr Inventory            (at cost)
 *  sales_return    the reverse of a sale
 *  adjustment      loss: Dr Supplies consumed, Cr Inventory — gain: the reverse
 *  transfer        no accounting entry (stock only moves between campuses)
 */
async function syncVoucherLedger(voucher: IStockVoucher, actorId?: string) {
  const id = String((voucher as unknown as { _id: unknown })._id);
  if (voucher.voucherType === "transfer") return;
  const inventory = await systemCode("inventoryAsset");
  const cogs = await systemCode("inventoryExpense");
  const net = round(Math.max(0, voucher.subtotal - (voucher.discountAmount || 0)));
  const tax = round(voucher.taxAmount || 0);
  const total = round(voucher.grandTotal);
  const cost = round(
    voucher.items.reduce((sum, it) => sum + Math.abs(it.quantity) * (it.unitCost || it.rate || 0), 0)
  );
  type L = { accountCode: string; debit: number; credit: number; narration?: string };
  const lines: L[] = [];
  const dr = (accountCode: string, amount: number, narration?: string) =>
    amount > 0 && lines.push({ accountCode, debit: round(amount), credit: 0, narration });
  const cr = (accountCode: string, amount: number, narration?: string) =>
    amount > 0 && lines.push({ accountCode, debit: 0, credit: round(amount), narration });

  if (voucher.voucherType === "purchase" || voucher.voucherType === "purchase_return") {
    const settle = await settlementCode(voucher);
    const taxCode = tax > 0 ? await systemCode("taxInput") : "";
    if (voucher.voucherType === "purchase") {
      dr(inventory, net, "Stock purchased");
      if (tax > 0) dr(taxCode, tax, "Input tax");
      cr(settle, total);
    } else {
      dr(settle, total);
      cr(inventory, net, "Stock returned to supplier");
      if (tax > 0) cr(taxCode, tax, "Input tax reversed");
    }
  } else if (voucher.voucherType === "sales" || voucher.voucherType === "sales_return") {
    const settle = await settlementCode(voucher);
    const sales = (
      await accountingService.ensureAccount({
        systemKey: "goodsSales",
        code: "42010102",
        name: "Sales of Goods (Store / Canteen)",
        type: "income",
        level: 5,
        parentCode: "420101",
        isPosting: true,
      })
    ).code as string;
    const taxCode = tax > 0 ? await systemCode("taxPayable") : "";
    if (voucher.voucherType === "sales") {
      dr(settle, total);
      cr(sales, net, "Goods sold");
      if (tax > 0) cr(taxCode, tax, "Output tax");
      dr(cogs, cost, "Cost of goods sold");
      cr(inventory, cost, "Stock issued at cost");
    } else {
      dr(sales, net, "Goods returned by customer");
      if (tax > 0) dr(taxCode, tax, "Output tax reversed");
      cr(settle, total);
      dr(inventory, cost, "Stock returned at cost");
      cr(cogs, cost, "Cost of goods sold reversed");
    }
  } else if (voucher.voucherType === "adjustment") {
    let gain = 0;
    let loss = 0;
    for (const it of voucher.items) {
      const value = Math.abs(it.quantity) * (it.unitCost || it.rate || 0);
      if (it.quantity > 0) gain += value;
      else loss += value;
    }
    if (loss > 0) {
      dr(cogs, loss, "Stock written off");
      cr(inventory, loss);
    }
    if (gain > 0) {
      dr(inventory, gain, "Stock found / added");
      cr(cogs, gain);
    }
  }

  await accountingService.postLinkedJournal({
    sourceType: "inventory",
    sourceId: id,
    date: voucher.date,
    branchCode: voucher.branchCode,
    narration: `${voucher.number} — ${voucher.narration}`,
    reference: voucher.reference || voucher.number,
    partyName: voucher.partyName,
    lines,
    actorId,
  });
}

async function buildVoucherItems(data: StockVoucherInput) {
  const ids = data.items.map((line) => line.itemId);
  const items = await InventoryItem.find({ _id: { $in: ids } }).lean();
  const map = new Map(items.map((item) => [String(item._id), item]));
  return data.items.map((line) => {
    const item = map.get(line.itemId);
    if (!item) throw new ServiceError("VALIDATION", "Selected product was not found", 400);
    const quantity =
      data.voucherType === "adjustment" ? line.quantity : Math.abs(line.quantity);
    if (!quantity) {
      throw new ServiceError("VALIDATION", `Quantity for ${item.name} cannot be zero`, 400);
    }
    const rate = line.rate || item.unitCost || 0;
    return {
      itemId: item._id,
      sku: item.sku,
      name: item.name,
      unit: item.unit,
      quantity,
      rate,
      amount: round(Math.abs(quantity) * rate),
      unitCost: item.unitCost || 0,
      description: (line as { description?: string }).description?.trim() || undefined,
    };
  });
}

export const inventoryService = {
  async list(branchCode?: string | null) {
    await dbConnect();
    const filter = branchCode ? { branchCode: branchCode.toUpperCase() } : {};
    return InventoryItem.find(filter).sort({ name: 1 }).lean();
  },

  async create(data: InventoryInput) {
    await dbConnect();
    const branchCode = (data.branchCode || (await defaultBranch())).toUpperCase();
    const item = await InventoryItem.create({
      ...data,
      branchCode,
      status: statusFromQty(data.quantity, data.reorderLevel),
      stock: data.quantity ? [{ branchCode, quantity: data.quantity }] : [],
    });
    const opening = round(Math.max(0, data.quantity * data.unitCost));
    if (opening > 0) {
      // Opening stock is something the school already owned: Dr Inventory, Cr Opening Balance Equity.
      const equity = await accountingService.ensureAccount({
        systemKey: "openingEquity",
        code: "31010102",
        name: "Opening Balance Equity",
        type: "equity",
        level: 5,
        parentCode: "310101",
        isPosting: true,
      });
      await accountingService.postLinkedJournal({
        sourceType: "inventory",
        sourceId: String(item._id),
        date: new Date(),
        branchCode,
        narration: `Opening stock: ${item.name} (${item.sku})`,
        reference: item.sku,
        lines: [
          { accountCode: await systemCode("inventoryAsset"), debit: opening, credit: 0 },
          { accountCode: equity.code as string, debit: 0, credit: opening },
        ],
      });
    }
    return item;
  },

  /** Product master edit — stock quantity only moves through stock vouchers. */
  async update(id: string, data: InventoryInput) {
    await dbConnect();
    const item = await InventoryItem.findById(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Item not found", 404);
    const { quantity: _ignored, ...rest } = data;
    Object.assign(item, {
      ...rest,
      branchCode: data.branchCode ? data.branchCode.toUpperCase() : item.branchCode,
      status: statusFromQty(item.quantity, data.reorderLevel),
    });
    await item.save();
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const used = await StockVoucher.exists({ "items.itemId": id, status: "posted" });
    if (used) {
      throw new ServiceError("CONFLICT", "Posted stock vouchers use this product", 409);
    }
    const item = await InventoryItem.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Item not found", 404);
    await accountingService.removeBySource("inventory", id);
    return { ok: true };
  },

  async stats(branchCode?: string | null) {
    await dbConnect();
    const match = branchCode ? { branchCode: branchCode.toUpperCase() } : {};
    const [total, low, out, value] = await Promise.all([
      InventoryItem.countDocuments(match),
      InventoryItem.countDocuments({ ...match, status: "low" }),
      InventoryItem.countDocuments({ ...match, status: "out" }),
      InventoryItem.aggregate([
        { $match: match },
        { $group: { _id: null, v: { $sum: { $multiply: ["$quantity", "$unitCost"] } } } },
      ]),
    ]);
    return { total, low, out, stockValue: value[0]?.v ?? 0 };
  },

  async vouchers(filters: {
    type?: string | null;
    status?: string | null;
    branchCode?: string | null;
  }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.type) query.voucherType = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    return StockVoucher.find(query).sort({ date: -1, createdAt: -1 }).limit(300).lean();
  },

  async createVoucher(data: StockVoucherInput, actor?: SessionUser) {
    await dbConnect();
    const branchCode = (data.branchCode || (await defaultBranch())).toUpperCase();
    const toBranchCode = data.toBranchCode ? data.toBranchCode.toUpperCase() : undefined;
    if (data.voucherType === "transfer") {
      if (!toBranchCode) {
        throw new ServiceError("VALIDATION", "Stock transfer needs a destination campus", 400);
      }
      if (toBranchCode === branchCode) {
        throw new ServiceError("VALIDATION", "Source and destination campus must differ", 400);
      }
    }
    if (
      (data.voucherType === "purchase" || data.voucherType === "purchase_return") &&
      !data.partyName?.trim()
    ) {
      throw new ServiceError("VALIDATION", "Supplier is required on this voucher", 400);
    }
    if (data.paymentMode === "credit" && !data.partyId) {
      throw new ServiceError(
        "VALIDATION",
        data.voucherType.startsWith("sales")
          ? "Pick the customer — a credit sale is recorded on their account"
          : "Pick the supplier — a credit purchase is recorded on their account",
        400
      );
    }
    const items = await buildVoucherItems(data);
    const subtotal = round(items.reduce((sum, item) => sum + item.amount, 0));
    const grandTotal = round(Math.max(0, subtotal - data.discountAmount) + data.taxAmount);
    const date = new Date(data.date);

    const voucher = await StockVoucher.create({
      number: await nextStockNumber(data.voucherType, branchCode, date),
      voucherType: data.voucherType,
      status: "draft",
      date,
      branchCode,
      toBranchCode,
      partyName: data.partyName?.trim() || undefined,
      partyType: data.partyType || undefined,
      partyId: data.partyId || undefined,
      paymentMode:
        data.voucherType === "transfer" || data.voucherType === "adjustment"
          ? undefined
          : data.paymentMode || "cash",
      settlementAccount: data.settlementAccount || undefined,
      reference: data.reference,
      narration: data.narration,
      items,
      subtotal,
      discountAmount: data.discountAmount,
      taxAmount: data.taxAmount,
      grandTotal,
      createdBy: actor?.id || undefined,
    });
    let result = voucher;
    if (data.postNow) {
      try {
        result = await this.postVoucher(String(voucher._id), actor);
      } catch (e) {
        await voucher.deleteOne();
        throw e;
      }
    }
    await recordAudit({
      module: "inventory",
      action: "created",
      entity: "voucher",
      entityId: String(result._id),
      summary: `Created ${result.number} (${result.voucherType})`,
      after: stockVoucherSnapshot(result.toObject()),
      actor,
    });
    return result;
  },

  async postVoucher(id: string, actor?: SessionUser) {
    await dbConnect();
    const voucher = await StockVoucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be posted", 409);
    }
    await applyStock(voucher, 1);
    voucher.status = "posted";
    voucher.postedAt = new Date();
    voucher.postedBy = actor?.id as never;
    await voucher.save();
    await syncVoucherLedger(voucher, actor?.id);
    await recordAudit({
      module: "inventory",
      action: "posted",
      entity: "voucher",
      entityId: id,
      summary: `Posted ${voucher.number}`,
      after: stockVoucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  async voidVoucher(id: string, reason: string, actor?: SessionUser) {
    await dbConnect();
    const voucher = await StockVoucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "posted") {
      throw new ServiceError("CONFLICT", "Only posted vouchers can be voided", 409);
    }
    const before = stockVoucherSnapshot(voucher.toObject());
    await applyStock(voucher, -1);
    voucher.status = "void";
    voucher.voidedAt = new Date();
    voucher.voidedBy = actor?.id as never;
    voucher.voidReason = reason || "Voided by administrator";
    await voucher.save();
    await accountingService.removeBySource("inventory", String(voucher._id));
    await recordAudit({
      module: "inventory",
      action: "voided",
      entity: "voucher",
      entityId: id,
      summary: `Voided ${voucher.number} — ${voucher.voidReason}`,
      before,
      after: stockVoucherSnapshot(voucher.toObject()),
      actor,
    });
    return voucher;
  },

  /**
   * Draft stock vouchers are removed outright. A posted voucher already moved
   * stock and (sometimes) posted to accounting, so deletion is only allowed for
   * admins and is carried out as a reversal (voidVoucher) instead of a raw
   * delete — this restores quantities and unlinks the accounting entry safely.
   */
  async removeVoucher(id: string, reason = "", actor?: SessionUser) {
    await dbConnect();
    const voucher = await StockVoucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status === "void") {
      throw new ServiceError("CONFLICT", "Voucher is already cancelled/voided", 409);
    }
    const before = stockVoucherSnapshot(voucher.toObject());
    if (voucher.status === "draft") {
      await voucher.deleteOne();
      await recordAudit({
        module: "inventory",
        action: "deleted",
        entity: "voucher",
        entityId: id,
        summary: `Deleted draft ${before.number}${reason ? ` — ${reason}` : ""}`,
        before,
        actor,
      });
      return { ok: true };
    }
    if (actor?.role !== "admin") {
      throw new ServiceError("FORBIDDEN", "Only an administrator can delete a posted transaction", 403);
    }
    if (!reason.trim()) {
      throw new ServiceError("VALIDATION", "A reason is required to delete a posted voucher", 400);
    }
    const reversed = await this.voidVoucher(id, reason, actor);
    await recordAudit({
      module: "inventory",
      action: "deleted",
      entity: "voucher",
      entityId: id,
      summary: `Deleted posted voucher ${before.number} via reversal — ${reason}`,
      before,
      after: stockVoucherSnapshot(reversed.toObject()),
      actor,
    });
    return { ok: true, voucher: reversed };
  },

  /** One stock voucher with school header and campus names — for the printable invoice. */
  async voucherForPrint(id: string) {
    await dbConnect();
    if (!/^[a-f0-9]{24}$/i.test(id)) throw new ServiceError("VALIDATION", "Invalid voucher ID", 400);
    const voucher = await StockVoucher.findById(id).populate("createdBy", "name").lean();
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    const s = await Settings.findOne()
      .select("schoolName address phone email currency logoUpdatedAt branches")
      .lean();
    const branchName = (code?: string) =>
      (s?.branches || []).find((b: { code: string; name: string }) => b.code === code)?.name || code || "";
    const settle = voucher.settlementAccount
      ? await Account.findOne({ code: voucher.settlementAccount }).select("name bankName accountNumber").lean()
      : null;
    const journal = await AccountingVoucher.findOne({
      sourceType: "inventory",
      sourceId: id,
      status: "posted",
    })
      .select("number lines")
      .lean();
    return {
      voucher,
      fromCampus: branchName(voucher.branchCode),
      toCampus: branchName(voucher.toBranchCode),
      settlement: settle,
      journal,
      school: {
        name: s?.schoolName || "School",
        address: s?.address || "",
        phone: s?.phone || "",
        email: s?.email || "",
        currency: s?.currency || "PKR",
        logoUrl: s?.logoUpdatedAt ? `/api/settings/logo?v=${new Date(s.logoUpdatedAt).getTime()}` : null,
      },
    };
  },

  /**
   * Item-wise stock ledger: every posted voucher that moved the item, with quantity in / out
   * and the running balance. With a campus selected, transfers count as out / in for that campus.
   */
  async stockLedger(itemId: string, opts: { branchCode?: string | null; from?: string | null; to?: string | null }) {
    await dbConnect();
    if (!/^[a-f0-9]{24}$/i.test(itemId)) throw new ServiceError("VALIDATION", "Pick an item", 400);
    const item = await InventoryItem.findById(itemId).lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Item not found", 404);
    const branch = opts.branchCode ? opts.branchCode.toUpperCase() : null;
    const vouchers = await StockVoucher.find({ status: "posted", "items.itemId": item._id })
      .sort({ date: 1, createdAt: 1 })
      .lean();

    const movement = (v: IStockVoucher, qty: number) => {
      const q = Math.abs(qty);
      switch (v.voucherType) {
        case "purchase":
        case "sales_return":
          return !branch || v.branchCode === branch ? q : 0;
        case "sales":
        case "purchase_return":
          return !branch || v.branchCode === branch ? -q : 0;
        case "adjustment":
          return !branch || v.branchCode === branch ? qty : 0;
        case "transfer":
          if (!branch) return 0;
          if (v.branchCode === branch) return -q;
          if (v.toBranchCode === branch) return q;
          return 0;
        default:
          return 0;
      }
    };

    const current = branch
      ? (item.stock || []).find((b: { branchCode: string }) => b.branchCode === branch)?.quantity ?? 0
      : item.quantity;
    const allMoves = vouchers.flatMap((v) =>
      v.items.filter((it: { itemId: unknown }) => String(it.itemId) === String(item._id)).map((it: IStockVoucherItem) => ({ v, it, qty: movement(v as unknown as IStockVoucher, it.quantity) }))
    );
    const net = allMoves.reduce((s2, m) => s2 + m.qty, 0);
    // Opening stock entered on the product itself (not through a voucher).
    let balance = round(current - net);
    const from = opts.from ? new Date(opts.from) : null;
    const to = opts.to ? new Date(`${opts.to}T23:59:59`) : null;
    const rows = [];
    let opening = balance;
    for (const m of allMoves) {
      const d = new Date(m.v.date);
      if (from && d < from) {
        balance = round(balance + m.qty);
        opening = balance;
        continue;
      }
      if (to && d > to) break;
      if (!m.qty && m.v.voucherType !== "transfer") continue;
      balance = round(balance + m.qty);
      rows.push({
        voucherId: String(m.v._id),
        date: m.v.date,
        number: m.v.number,
        type: m.v.voucherType,
        party:
          m.v.voucherType === "transfer"
            ? `${m.v.branchCode} → ${m.v.toBranchCode}`
            : m.v.partyName || "",
        qtyIn: m.qty > 0 ? m.qty : 0,
        qtyOut: m.qty < 0 ? -m.qty : 0,
        rate: m.it.rate,
        amount: round(Math.abs(m.qty) * m.it.rate),
        balance,
      });
    }
    return {
      item: { _id: String(item._id), sku: item.sku, name: item.name, unit: item.unit, unitCost: item.unitCost, salePrice: item.salePrice },
      branch,
      opening,
      rows,
      closing: balance,
      closingValue: round(balance * (item.unitCost || 0)),
      totals: {
        qtyIn: round(rows.reduce((t, r) => t + r.qtyIn, 0)),
        qtyOut: round(rows.reduce((t, r) => t + r.qtyOut, 0)),
      },
    };
  },

  async auditTrail(voucherId: string) {
    return getAuditTrail("inventory", "voucher", voucherId);
  },
};
