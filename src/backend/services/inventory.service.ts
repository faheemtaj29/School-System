import { dbConnect } from "@/backend/config/database";
import {
  InventoryItem,
  StockVoucher,
  type IStockVoucher,
  type StockVoucherType,
} from "@/backend/models/Inventory";
import { AccountingCounter } from "@/backend/models/Accounting";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import type { z } from "zod";
import type {
  inventorySchema,
  stockVoucherSchema,
} from "@/backend/validators/modules.validator";
import { accountingService } from "@/backend/services/accounting.service";

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

/** How each posted stock voucher hits the ledger; transfers/adjustments stay off-book. */
const GL: Partial<Record<StockVoucherType, { type: "income" | "expense"; accountKey: string; category: string }>> = {
  purchase: { type: "expense", accountKey: "inventoryAsset", category: "Inventory / Purchase" },
  purchase_return: { type: "income", accountKey: "inventoryAsset", category: "Inventory / Purchase Return" },
  sales: { type: "income", accountKey: "miscIncome", category: "Inventory / Sales" },
  sales_return: { type: "expense", accountKey: "miscIncome", category: "Inventory / Sales Return" },
};

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

async function syncVoucherLedger(voucher: IStockVoucher) {
  const map = GL[voucher.voucherType];
  if (!map || voucher.grandTotal <= 0) return;
  await accountingService.upsertLinked({
    type: map.type,
    accountKey: map.accountKey,
    category: map.category,
    title: `${voucher.number} — ${voucher.narration}`,
    amount: voucher.grandTotal,
    date: voucher.date,
    method: "cash",
    reference: voucher.reference || voucher.number,
    notes: voucher.partyName ? `Party: ${voucher.partyName}` : undefined,
    branchCode: voucher.branchCode,
    sourceType: "inventory",
    sourceId: String((voucher as unknown as { _id: unknown })._id),
    skipTax: true,
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
      await accountingService.upsertLinked({
        type: "expense",
        accountKey: "inventoryAsset",
        category: "Inventory / Opening Stock",
        title: `Opening stock: ${item.name} (${item.sku})`,
        amount: opening,
        date: new Date(),
        method: "cash",
        reference: item.sku,
        notes: data.supplier ? `Supplier: ${data.supplier}` : "Opening stock valuation",
        branchCode,
        sourceType: "inventory",
        sourceId: String(item._id),
        skipTax: true,
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

  async createVoucher(data: StockVoucherInput, userId?: string) {
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
      reference: data.reference,
      narration: data.narration,
      items,
      subtotal,
      discountAmount: data.discountAmount,
      taxAmount: data.taxAmount,
      grandTotal,
      createdBy: userId || undefined,
    });
    if (!data.postNow) return voucher;
    try {
      return await this.postVoucher(String(voucher._id), userId);
    } catch (e) {
      await voucher.deleteOne();
      throw e;
    }
  },

  async postVoucher(id: string, userId?: string) {
    await dbConnect();
    const voucher = await StockVoucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be posted", 409);
    }
    await applyStock(voucher, 1);
    voucher.status = "posted";
    voucher.postedAt = new Date();
    voucher.postedBy = userId as never;
    await voucher.save();
    await syncVoucherLedger(voucher);
    return voucher;
  },

  async voidVoucher(id: string, reason: string, userId?: string) {
    await dbConnect();
    const voucher = await StockVoucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "posted") {
      throw new ServiceError("CONFLICT", "Only posted vouchers can be voided", 409);
    }
    await applyStock(voucher, -1);
    voucher.status = "void";
    voucher.voidedAt = new Date();
    voucher.voidedBy = userId as never;
    voucher.voidReason = reason || "Voided by administrator";
    await voucher.save();
    await accountingService.removeBySource("inventory", String(voucher._id));
    return voucher;
  },

  async removeVoucher(id: string) {
    await dbConnect();
    const voucher = await StockVoucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be deleted", 409);
    }
    await voucher.deleteOne();
    return { ok: true };
  },
};
