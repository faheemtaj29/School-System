/**
 * Double-entry accounting: 5-level COA, vouchers, invoices and legacy projection.
 * Existing modules keep using upsertLinked/removeBySource unchanged.
 */
import { dbConnect } from "@/backend/config/database";
import { Account, AccountingCounter, Voucher } from "@/backend/models/Accounting";
import { LedgerEntry, type LedgerSource } from "@/backend/models/Ledger";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import type { z } from "zod";
import type {
  accountSchema,
  ledgerSchema,
  voucherSchema,
} from "@/backend/validators/modules.validator";

type LedgerInput = z.infer<typeof ledgerSchema>;
type AccountInput = z.infer<typeof accountSchema>;
type VoucherInput = z.infer<typeof voucherSchema>;

export type LinkedPost = {
  type: "income" | "expense";
  category: string;
  title: string;
  amount: number;
  date?: Date | string;
  method?: "cash" | "bank" | "online" | "cheque";
  reference?: string;
  notes?: string;
  branchCode?: string;
  sourceType: Exclude<LedgerSource, "manual">;
  sourceId: string;
  skipTax?: boolean;
  recordedBy?: string;
  /** Overrides the default income/expense account chosen from sourceType. */
  accountKey?: string;
};

type SeedAccount = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  level: 1 | 2 | 3 | 4 | 5;
  parentCode?: string;
  posting?: boolean;
  cashBank?: boolean;
  systemKey?: string;
};

const COA_SEED: SeedAccount[] = [
  { code: "1", name: "Assets", type: "asset", level: 1 },
  { code: "11", name: "Current Assets", type: "asset", level: 2, parentCode: "1" },
  { code: "1101", name: "Cash & Bank", type: "asset", level: 3, parentCode: "11" },
  { code: "110101", name: "Cash Accounts", type: "asset", level: 4, parentCode: "1101" },
  { code: "11010101", name: "Cash in Hand", type: "asset", level: 5, parentCode: "110101", posting: true, cashBank: true, systemKey: "cash" },
  { code: "11010102", name: "Main Bank Account", type: "asset", level: 5, parentCode: "110101", posting: true, cashBank: true, systemKey: "bank" },
  { code: "1103", name: "Receivables", type: "asset", level: 3, parentCode: "11" },
  { code: "110301", name: "Student Receivables", type: "asset", level: 4, parentCode: "1103" },
  { code: "11030101", name: "Fees Receivable", type: "asset", level: 5, parentCode: "110301", posting: true, systemKey: "feesReceivable" },
  { code: "1104", name: "Inventory", type: "asset", level: 3, parentCode: "11" },
  { code: "110401", name: "School Stores", type: "asset", level: 4, parentCode: "1104" },
  { code: "11040101", name: "Inventory / Stores Asset", type: "asset", level: 5, parentCode: "110401", posting: true, systemKey: "inventoryAsset" },
  { code: "1105", name: "Tax Assets", type: "asset", level: 3, parentCode: "11" },
  { code: "110501", name: "Input Tax", type: "asset", level: 4, parentCode: "1105" },
  { code: "11050101", name: "Input GST / VAT", type: "asset", level: 5, parentCode: "110501", posting: true, systemKey: "taxInput" },
  { code: "12", name: "Non-current Assets", type: "asset", level: 2, parentCode: "1" },
  { code: "1201", name: "Property & Equipment", type: "asset", level: 3, parentCode: "12" },
  { code: "120101", name: "Equipment", type: "asset", level: 4, parentCode: "1201" },
  { code: "12010101", name: "Furniture & Equipment", type: "asset", level: 5, parentCode: "120101", posting: true },

  { code: "2", name: "Liabilities", type: "liability", level: 1 },
  { code: "21", name: "Current Liabilities", type: "liability", level: 2, parentCode: "2" },
  { code: "2101", name: "Payroll Liabilities", type: "liability", level: 3, parentCode: "21" },
  { code: "210101", name: "Salaries Payable Control", type: "liability", level: 4, parentCode: "2101" },
  { code: "21010101", name: "Salaries Payable", type: "liability", level: 5, parentCode: "210101", posting: true, systemKey: "payrollPayable" },
  { code: "2102", name: "Tax Liabilities", type: "liability", level: 3, parentCode: "21" },
  { code: "210201", name: "Output Tax Control", type: "liability", level: 4, parentCode: "2102" },
  { code: "21020101", name: "GST / VAT Payable", type: "liability", level: 5, parentCode: "210201", posting: true, systemKey: "taxPayable" },
  { code: "2103", name: "Trade Payables", type: "liability", level: 3, parentCode: "21" },
  { code: "210301", name: "Suppliers Control", type: "liability", level: 4, parentCode: "2103" },
  { code: "21030101", name: "Suppliers Payable", type: "liability", level: 5, parentCode: "210301", posting: true, systemKey: "suppliersPayable" },

  { code: "3", name: "Equity", type: "equity", level: 1 },
  { code: "31", name: "Capital / Corpus", type: "equity", level: 2, parentCode: "3" },
  { code: "3101", name: "Capital Funds", type: "equity", level: 3, parentCode: "31" },
  { code: "310101", name: "Capital Control", type: "equity", level: 4, parentCode: "3101" },
  { code: "31010101", name: "Capital / Corpus Fund", type: "equity", level: 5, parentCode: "310101", posting: true },
  { code: "32", name: "Retained Surplus", type: "equity", level: 2, parentCode: "3" },
  { code: "3201", name: "Accumulated Results", type: "equity", level: 3, parentCode: "32" },
  { code: "320101", name: "Retained Earnings Control", type: "equity", level: 4, parentCode: "3201" },
  { code: "32010101", name: "Retained Surplus", type: "equity", level: 5, parentCode: "320101", posting: true },

  { code: "4", name: "Income", type: "income", level: 1 },
  { code: "41", name: "Operating Income", type: "income", level: 2, parentCode: "4" },
  { code: "4101", name: "School Fees Income", type: "income", level: 3, parentCode: "41" },
  { code: "410101", name: "Fees Income Control", type: "income", level: 4, parentCode: "4101" },
  { code: "41010101", name: "Student Tuition & Fees", type: "income", level: 5, parentCode: "410101", posting: true, systemKey: "feeIncome" },
  { code: "4102", name: "Online Program Income", type: "income", level: 3, parentCode: "41" },
  { code: "410201", name: "Distance Learning Control", type: "income", level: 4, parentCode: "4102" },
  { code: "41020101", name: "Distance / Online Courses", type: "income", level: 5, parentCode: "410201", posting: true, systemKey: "distanceIncome" },
  { code: "42", name: "Other Income", type: "income", level: 2, parentCode: "4" },
  { code: "4201", name: "Miscellaneous Income", type: "income", level: 3, parentCode: "42" },
  { code: "420101", name: "Other Income Control", type: "income", level: 4, parentCode: "4201" },
  { code: "42010101", name: "Donations & Misc Income", type: "income", level: 5, parentCode: "420101", posting: true, systemKey: "miscIncome" },

  { code: "5", name: "Expenses", type: "expense", level: 1 },
  { code: "51", name: "Personnel Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5101", name: "Payroll Expense", type: "expense", level: 3, parentCode: "51" },
  { code: "510101", name: "Payroll Control", type: "expense", level: 4, parentCode: "5101" },
  { code: "51010101", name: "Salaries & Wages", type: "expense", level: 5, parentCode: "510101", posting: true, systemKey: "payrollExpense" },
  { code: "52", name: "Academic & Operating Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5201", name: "School Supplies", type: "expense", level: 3, parentCode: "52" },
  { code: "520101", name: "Supplies Control", type: "expense", level: 4, parentCode: "5201" },
  { code: "52010101", name: "Inventory / Supplies Consumed", type: "expense", level: 5, parentCode: "520101", posting: true, systemKey: "inventoryExpense" },
  { code: "5202", name: "Utilities", type: "expense", level: 3, parentCode: "52" },
  { code: "520201", name: "Utilities Control", type: "expense", level: 4, parentCode: "5202" },
  { code: "52020101", name: "Electricity, Gas & Internet", type: "expense", level: 5, parentCode: "520201", posting: true },
  { code: "5203", name: "Repairs & Maintenance", type: "expense", level: 3, parentCode: "52" },
  { code: "520301", name: "Maintenance Control", type: "expense", level: 4, parentCode: "5203" },
  { code: "52030101", name: "Repairs & Maintenance", type: "expense", level: 5, parentCode: "520301", posting: true },
  { code: "53", name: "General Expenses", type: "expense", level: 2, parentCode: "5" },
  { code: "5301", name: "Administrative Expenses", type: "expense", level: 3, parentCode: "53" },
  { code: "530101", name: "General Expense Control", type: "expense", level: 4, parentCode: "5301" },
  { code: "53010101", name: "General Expense", type: "expense", level: 5, parentCode: "530101", posting: true, systemKey: "generalExpense" },
];

const PREFIX: Record<string, string> = {
  journal: "JV",
  receipt: "RV",
  payment: "PV",
  contra: "CV",
  sales_invoice: "SI",
  purchase_invoice: "PI",
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

async function loadFinanceSettings() {
  await dbConnect();
  let doc = await Settings.findOne().lean();
  if (!doc) {
    const created = await Settings.create({});
    doc = created.toObject();
  }
  return doc;
}

export function calcTax(
  amount: number,
  settings: { taxEnabled?: boolean; taxRate?: number; taxInclusive?: boolean }
) {
  if (!settings.taxEnabled || !settings.taxRate || amount <= 0) {
    return { amount, taxAmount: 0 };
  }
  const rate = settings.taxRate / 100;
  if (settings.taxInclusive) {
    const taxAmount = round((amount * rate) / (1 + rate));
    return { amount, taxAmount };
  }
  const taxAmount = round(amount * rate);
  return { amount: round(amount + taxAmount), taxAmount };
}

function mapMethod(method?: string): "cash" | "bank" | "online" | "cheque" | undefined {
  if (!method) return undefined;
  if (method === "card") return "online";
  if (method === "cash" || method === "bank" || method === "online" || method === "cheque") {
    return method;
  }
  return "cash";
}

async function ensureSeeded() {
  await dbConnect();
  if ((await Account.countDocuments()) > 0) return;
  await Account.bulkWrite(
    COA_SEED.map((a) => ({
      updateOne: {
        filter: { code: a.code },
        update: {
          $setOnInsert: {
            code: a.code,
            name: a.name,
            type: a.type,
            nature: a.type === "asset" || a.type === "expense" ? "debit" : "credit",
            level: a.level,
            parentCode: a.parentCode,
            isControl: !a.posting,
            isPosting: Boolean(a.posting),
            isCashBank: Boolean(a.cashBank),
            isActive: true,
            systemKey: a.systemKey,
            openingBalance: 0,
            openingBalanceSide:
              a.type === "asset" || a.type === "expense" ? "debit" : "credit",
          },
        },
        upsert: true,
      },
    }))
  );
}

export type ReportRange = {
  branchCode?: string | null;
  from?: string | null;
  to?: string | null;
};

type Movement = { debit: number; credit: number };

function rangeDates(range: ReportRange) {
  const from = range.from ? new Date(range.from) : null;
  const to = range.to ? new Date(range.to) : null;
  if (from && Number.isNaN(from.getTime())) return { from: null, to };
  if (to) {
    if (Number.isNaN(to.getTime())) return { from, to: null };
    to.setHours(23, 59, 59, 999);
  }
  return { from, to };
}

function baseMatch(branchCode?: string | null) {
  const match: Record<string, unknown> = { status: "posted" };
  if (branchCode) match.branchCode = branchCode.toUpperCase();
  return match;
}

function emptyMovements() {
  return new Map<string, Movement>();
}

async function movementsByAccount(match: Record<string, unknown>) {
  const rows = await Voucher.aggregate([
    { $match: match },
    { $unwind: "$lines" },
    {
      $group: {
        _id: "$lines.accountCode",
        debit: { $sum: "$lines.debit" },
        credit: { $sum: "$lines.credit" },
      },
    },
  ]);
  return new Map<string, Movement>(
    rows.map((row) => [row._id as string, { debit: row.debit || 0, credit: row.credit || 0 }])
  );
}

/** Resolves the level-2 reporting head (e.g. "Operating Income") for any account. */
async function groupResolver() {
  const all = await Account.find().select("code name level parentCode type").lean();
  const byCode = new Map(all.map((a) => [a.code, a]));
  return (code: string) => {
    let current = byCode.get(code);
    while (current && current.level > 2 && current.parentCode) {
      const parent = byCode.get(current.parentCode);
      if (!parent) break;
      current = parent;
    }
    return current ? { code: current.code, name: current.name } : null;
  };
}

async function nextVoucherNumber(type: string, branchCode: string, date: Date) {
  const prefix = PREFIX[type] || "JV";
  const year = date.getFullYear();
  const branch = branchCode.toUpperCase();
  const key = `${prefix}:${branch}:${year}`;
  const counter = await AccountingCounter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return `${prefix}-${branch}-${year}-${String(counter.seq).padStart(5, "0")}`;
}

async function systemAccount(key: string) {
  await ensureSeeded();
  const account = await Account.findOne({ systemKey: key, isActive: true }).lean();
  if (!account) throw new ServiceError("INTERNAL", `System account '${key}' is missing`, 500);
  return account;
}

async function enrichAndValidateLines(
  lines: { accountCode: string; debit: number; credit: number; narration?: string }[],
  voucherType: string
) {
  if (lines.length < 2) {
    throw new ServiceError("VALIDATION", "At least two voucher lines are required", 400);
  }
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const accounts = await Account.find({ code: { $in: codes }, isActive: true }).lean();
  const map = new Map(accounts.map((a) => [a.code, a]));
  const result = lines.map((line) => {
    const account = map.get(line.accountCode);
    if (!account) throw new ServiceError("VALIDATION", `Account ${line.accountCode} not found`, 400);
    if (!account.isPosting) {
      throw new ServiceError("VALIDATION", `${account.code} ${account.name} is a control account`, 400);
    }
    if ((line.debit > 0) === (line.credit > 0)) {
      throw new ServiceError("VALIDATION", "Each line must contain debit or credit, not both", 400);
    }
    return {
      accountCode: account.code,
      accountName: account.name,
      debit: round(line.debit || 0),
      credit: round(line.credit || 0),
      narration: line.narration,
      isCashBank: account.isCashBank,
      type: account.type,
    };
  });
  const debit = round(result.reduce((sum, line) => sum + line.debit, 0));
  const credit = round(result.reduce((sum, line) => sum + line.credit, 0));
  if (debit <= 0 || Math.abs(debit - credit) > 0.009) {
    throw new ServiceError(
      "VALIDATION",
      `Voucher is not balanced. Debit ${debit.toFixed(2)}, Credit ${credit.toFixed(2)}`,
      400
    );
  }
  if (voucherType === "receipt" && !result.some((l) => l.isCashBank && l.debit > 0)) {
    throw new ServiceError("VALIDATION", "Receipt voucher requires a Cash/Bank debit", 400);
  }
  if (voucherType === "payment" && !result.some((l) => l.isCashBank && l.credit > 0)) {
    throw new ServiceError("VALIDATION", "Payment voucher requires a Cash/Bank credit", 400);
  }
  if (
    voucherType === "contra" &&
    result.some((l) => !l.isCashBank || (l.type !== "asset" && l.type !== "liability"))
  ) {
    throw new ServiceError("VALIDATION", "Contra voucher can only use Cash/Bank accounts", 400);
  }
  return {
    lines: result.map(({ isCashBank: _cash, type: _type, ...line }) => line),
    total: debit,
  };
}

async function invoiceLines(data: VoucherInput) {
  if (!data.items.length) {
    throw new ServiceError("VALIDATION", "Invoice requires at least one item", 400);
  }
  if (!data.partyName?.trim()) {
    throw new ServiceError("VALIDATION", "Invoice party/customer/supplier is required", 400);
  }
  if (!data.dueDate) {
    throw new ServiceError("VALIDATION", "Invoice due date is required", 400);
  }
  const subtotal = round(
    data.items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  );
  const net = round(Math.max(0, subtotal - data.discountAmount));
  const grandTotal = round(net + data.taxAmount);
  if (data.voucherType === "sales_invoice") {
    const [receivable, income, taxPayable] = await Promise.all([
      systemAccount("feesReceivable"),
      systemAccount("miscIncome"),
      data.taxAmount > 0 ? systemAccount("taxPayable") : null,
    ]);
    return {
      subtotal,
      grandTotal,
      lines: [
        { accountCode: receivable.code, debit: grandTotal, credit: 0 },
        { accountCode: income.code, debit: 0, credit: net },
        ...(taxPayable
          ? [{ accountCode: taxPayable.code, debit: 0, credit: data.taxAmount }]
          : []),
      ],
    };
  }
  const [expense, payable, taxInput] = await Promise.all([
    systemAccount("generalExpense"),
    systemAccount("suppliersPayable"),
    data.taxAmount > 0 ? systemAccount("taxInput") : null,
  ]);
  return {
    subtotal,
    grandTotal,
    lines: [
      { accountCode: expense.code, debit: net, credit: 0 },
      ...(taxInput ? [{ accountCode: taxInput.code, debit: data.taxAmount, credit: 0 }] : []),
      { accountCode: payable.code, debit: 0, credit: grandTotal },
    ],
  };
}

async function createDoubleEntryVoucher(
  data: VoucherInput,
  userId?: string,
  forced?: { sourceType: LedgerSource; sourceId: string; status: "posted" }
) {
  await ensureSeeded();
  const settings = await loadFinanceSettings();
  const date = new Date(data.date);
  const branchCode = (data.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase();
  const isInvoice =
    data.voucherType === "sales_invoice" || data.voucherType === "purchase_invoice";
  const invoice = isInvoice ? await invoiceLines(data) : null;
  const checked = await enrichAndValidateLines(
    invoice?.lines || data.lines,
    data.voucherType
  );
  const number = await nextVoucherNumber(data.voucherType, branchCode, date);
  const posted = forced?.status === "posted" || data.postNow;

  return Voucher.create({
    number,
    voucherType: data.voucherType,
    status: posted ? "posted" : "draft",
    date,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    branchCode,
    partyType: data.partyType || undefined,
    partyId: data.partyId || undefined,
    partyName: data.partyName || undefined,
    narration: data.narration,
    reference: data.reference,
    currency: settings.currency || "PKR",
    subtotal: invoice?.subtotal || checked.total,
    discountAmount: data.discountAmount,
    taxAmount: data.taxAmount,
    taxName: data.taxAmount > 0 ? settings.taxName || "Tax" : undefined,
    grandTotal: invoice?.grandTotal || checked.total,
    items: data.items.map((item) => ({
      ...item,
      amount: round(item.quantity * item.rate),
    })),
    lines: checked.lines,
    sourceType: forced?.sourceType || "manual",
    sourceId: forced?.sourceId,
    createdBy: userId || undefined,
    postedBy: posted ? userId || undefined : undefined,
    postedAt: posted ? new Date() : undefined,
  });
}

export const accountingService = {
  async seedAccounts() {
    await ensureSeeded();
    return { ok: true, count: await Account.countDocuments() };
  },

  async accounts() {
    await ensureSeeded();
    return Account.find().sort({ code: 1 }).lean();
  },

  async createAccount(data: AccountInput) {
    await ensureSeeded();
    const parentCode = data.parentCode || undefined;
    if (data.level === 1 && parentCode) {
      throw new ServiceError("VALIDATION", "Level 1 account cannot have a parent", 400);
    }
    if (data.level > 1) {
      const parent = await Account.findOne({ code: parentCode }).lean();
      if (!parent || parent.level !== data.level - 1) {
        throw new ServiceError("VALIDATION", `Level ${data.level} requires a level ${data.level - 1} parent`, 400);
      }
      if (parent.type !== data.type) {
        throw new ServiceError("VALIDATION", "Child account type must match its parent", 400);
      }
    }
    if (data.isControl === data.isPosting) {
      throw new ServiceError("VALIDATION", "Account must be either control or posting", 400);
    }
    if (data.level === 5 && !data.isPosting) {
      throw new ServiceError("VALIDATION", "Level 5 account must be a posting account", 400);
    }
    return Account.create({
      ...data,
      parentCode,
      nature: data.type === "asset" || data.type === "expense" ? "debit" : "credit",
    });
  },

  async setAccountActive(id: string, isActive: boolean) {
    const account = await Account.findById(id);
    if (!account) throw new ServiceError("NOT_FOUND", "Account not found", 404);
    if (!isActive) {
      const used = await Voucher.exists({
        status: "posted",
        "lines.accountCode": account.code,
      });
      if (used) {
        throw new ServiceError("CONFLICT", "Posted vouchers use this account; it cannot be disabled", 409);
      }
    }
    account.isActive = isActive;
    await account.save();
    return account;
  },

  async vouchers(filters: {
    type?: string | null;
    status?: string | null;
    branchCode?: string | null;
  }) {
    await ensureSeeded();
    const query: Record<string, unknown> = {};
    if (filters.type) query.voucherType = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.branchCode) query.branchCode = filters.branchCode.toUpperCase();
    return Voucher.find(query)
      .populate("createdBy", "name email")
      .populate("postedBy", "name email")
      .sort({ date: -1, createdAt: -1 })
      .limit(300)
      .lean();
  },

  async createVoucher(data: VoucherInput, userId?: string) {
    return createDoubleEntryVoucher(data, userId);
  },

  async postVoucher(id: string, userId?: string) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be posted", 409);
    }
    await enrichAndValidateLines(voucher.lines, voucher.voucherType);
    voucher.status = "posted";
    voucher.postedAt = new Date();
    voucher.postedBy = userId as never;
    await voucher.save();
    return voucher;
  },

  async voidVoucher(id: string, reason: string, userId?: string) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "posted") {
      throw new ServiceError("CONFLICT", "Only posted vouchers can be voided", 409);
    }
    voucher.status = "void";
    voucher.voidedAt = new Date();
    voucher.voidedBy = userId as never;
    voucher.voidReason = reason || "Voided by administrator";
    await voucher.save();
    return voucher;
  },

  async removeVoucher(id: string) {
    const voucher = await Voucher.findById(id);
    if (!voucher) throw new ServiceError("NOT_FOUND", "Voucher not found", 404);
    if (voucher.status !== "draft") {
      throw new ServiceError("CONFLICT", "Only draft vouchers can be deleted", 409);
    }
    await voucher.deleteOne();
    return { ok: true };
  },

  /**
   * Period trial balance: opening (brought forward), period movement and
   * closing balance per posting account — the standard audit format.
   */
  async trialBalance(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const periodMatch: Record<string, unknown> = { ...base };
    if (from || to) {
      periodMatch.date = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const [openingMovement, periodMovement, accounts] = await Promise.all([
      from ? movementsByAccount({ ...base, date: { $lt: from } }) : emptyMovements(),
      movementsByAccount(periodMatch),
      Account.find({ isPosting: true }).sort({ code: 1 }).lean(),
    ]);

    const rows = accounts
      .map((account) => {
        const opened = openingMovement.get(account.code) || { debit: 0, credit: 0 };
        const moved = periodMovement.get(account.code) || { debit: 0, credit: 0 };
        let openingNet = opened.debit - opened.credit;
        if (account.openingBalance) {
          openingNet +=
            account.openingBalanceSide === "debit"
              ? account.openingBalance
              : -account.openingBalance;
        }
        const periodDebit = round(moved.debit);
        const periodCredit = round(moved.credit);
        const closingNet = round(openingNet + periodDebit - periodCredit);
        return {
          code: account.code,
          name: account.name,
          type: account.type,
          openingDebit: openingNet > 0 ? round(openingNet) : 0,
          openingCredit: openingNet < 0 ? round(Math.abs(openingNet)) : 0,
          periodDebit,
          periodCredit,
          debit: closingNet > 0 ? closingNet : 0,
          credit: closingNet < 0 ? Math.abs(closingNet) : 0,
        };
      })
      .filter(
        (row) =>
          row.debit ||
          row.credit ||
          row.periodDebit ||
          row.periodCredit ||
          row.openingDebit ||
          row.openingCredit
      );

    const sum = (key: keyof (typeof rows)[number]) =>
      round(rows.reduce((total, row) => total + Number(row[key] || 0), 0));

    return {
      rows,
      openingDebit: sum("openingDebit"),
      openingCredit: sum("openingCredit"),
      periodDebit: sum("periodDebit"),
      periodCredit: sum("periodCredit"),
      totalDebit: sum("debit"),
      totalCredit: sum("credit"),
    };
  },

  async statements(range: ReportRange = {}) {
    const tb = await this.trialBalance(range);
    const income = round(
      tb.rows.filter((r) => r.type === "income").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    const expense = round(
      tb.rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.debit - r.credit, 0)
    );
    const assets = round(
      tb.rows.filter((r) => r.type === "asset").reduce((s, r) => s + r.debit - r.credit, 0)
    );
    const liabilities = round(
      tb.rows.filter((r) => r.type === "liability").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    const equity = round(
      tb.rows.filter((r) => r.type === "equity").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    return {
      income,
      expense,
      surplus: round(income - expense),
      assets,
      liabilities,
      equity,
      trialBalance: tb,
    };
  },

  /** Income & Expenditure statement for the selected period, grouped by head. */
  async profitAndLoss(range: ReportRange = {}) {
    const [tb, groupOf] = await Promise.all([this.trialBalance(range), groupResolver()]);
    const useMovement = Boolean(range.from || range.to);
    const valueOf = (row: (typeof tb.rows)[number], creditPositive: boolean) => {
      const debit = useMovement ? row.periodDebit : row.debit;
      const credit = useMovement ? row.periodCredit : row.credit;
      return round(creditPositive ? credit - debit : debit - credit);
    };

    const buildSection = (type: "income" | "expense") => {
      const groups = new Map<
        string,
        { code: string; name: string; total: number; accounts: { code: string; name: string; amount: number }[] }
      >();
      for (const row of tb.rows.filter((r) => r.type === type)) {
        const amount = valueOf(row, type === "income");
        if (!amount) continue;
        const group = groupOf(row.code);
        const key = group?.code || row.code;
        const entry =
          groups.get(key) ||
          { code: key, name: group?.name || row.name, total: 0, accounts: [] };
        entry.accounts.push({ code: row.code, name: row.name, amount });
        entry.total = round(entry.total + amount);
        groups.set(key, entry);
      }
      const list = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
      return { groups: list, total: round(list.reduce((s, g) => s + g.total, 0)) };
    };

    const income = buildSection("income");
    const expense = buildSection("expense");
    return {
      income,
      expense,
      surplus: round(income.total - expense.total),
    };
  },

  /** Statement of financial position as at the end of the selected period. */
  async balanceSheet(range: ReportRange = {}) {
    const [tb, groupOf] = await Promise.all([
      this.trialBalance({ branchCode: range.branchCode, to: range.to }),
      groupResolver(),
    ]);

    const buildSection = (type: "asset" | "liability" | "equity") => {
      const creditPositive = type !== "asset";
      const groups = new Map<
        string,
        { code: string; name: string; total: number; accounts: { code: string; name: string; amount: number }[] }
      >();
      for (const row of tb.rows.filter((r) => r.type === type)) {
        const amount = round(
          creditPositive ? row.credit - row.debit : row.debit - row.credit
        );
        if (!amount) continue;
        const group = groupOf(row.code);
        const key = group?.code || row.code;
        const entry =
          groups.get(key) ||
          { code: key, name: group?.name || row.name, total: 0, accounts: [] };
        entry.accounts.push({ code: row.code, name: row.name, amount });
        entry.total = round(entry.total + amount);
        groups.set(key, entry);
      }
      const list = [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
      return { groups: list, total: round(list.reduce((s, g) => s + g.total, 0)) };
    };

    const income = round(
      tb.rows.filter((r) => r.type === "income").reduce((s, r) => s + r.credit - r.debit, 0)
    );
    const expense = round(
      tb.rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.debit - r.credit, 0)
    );
    const surplus = round(income - expense);
    const assets = buildSection("asset");
    const liabilities = buildSection("liability");
    const equity = buildSection("equity");
    const equityTotal = round(equity.total + surplus);
    return {
      assets,
      liabilities,
      equity,
      surplus,
      equityTotal,
      totalAssets: assets.total,
      totalLiabilitiesEquity: round(liabilities.total + equityTotal),
      balanced: Math.abs(assets.total - (liabilities.total + equityTotal)) < 0.01,
    };
  },

  /** Account ledger with brought-forward balance and running balance. */
  async generalLedger(range: ReportRange & { accountCode: string }) {
    await ensureSeeded();
    const account = await Account.findOne({ code: range.accountCode }).lean();
    if (!account) throw new ServiceError("NOT_FOUND", "Account not found", 404);

    const { from, to } = rangeDates(range);
    const base = baseMatch(range.branchCode);
    const opened = from
      ? (await movementsByAccount({ ...base, date: { $lt: from } })).get(account.code)
      : undefined;
    let balance = (opened?.debit || 0) - (opened?.credit || 0);
    if (account.openingBalance) {
      balance +=
        account.openingBalanceSide === "debit"
          ? account.openingBalance
          : -account.openingBalance;
    }
    const openingBalance = round(balance);

    const query: Record<string, unknown> = {
      ...base,
      "lines.accountCode": account.code,
    };
    if (from || to) {
      query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const vouchers = await Voucher.find(query)
      .sort({ date: 1, number: 1 })
      .limit(1000)
      .lean();

    const rows: {
      voucherId: string;
      number: string;
      voucherType: string;
      date: Date;
      narration: string;
      partyName?: string;
      contra: string;
      debit: number;
      credit: number;
      balance: number;
    }[] = [];

    for (const voucher of vouchers) {
      for (const line of voucher.lines.filter(
        (l: { accountCode: string }) => l.accountCode === account.code
      )) {
        balance = round(balance + (line.debit || 0) - (line.credit || 0));
        rows.push({
          voucherId: String(voucher._id),
          number: voucher.number,
          voucherType: voucher.voucherType,
          date: voucher.date,
          narration: line.narration || voucher.narration,
          partyName: voucher.partyName,
          contra: voucher.lines
            .filter((l: { accountCode: string }) => l.accountCode !== account.code)
            .map((l: { accountName: string }) => l.accountName)
            .join(", "),
          debit: round(line.debit || 0),
          credit: round(line.credit || 0),
          balance,
        });
      }
    }

    return {
      account: {
        code: account.code,
        name: account.name,
        type: account.type,
        nature: account.nature,
      },
      openingBalance,
      rows,
      totalDebit: round(rows.reduce((s, r) => s + r.debit, 0)),
      totalCredit: round(rows.reduce((s, r) => s + r.credit, 0)),
      closingBalance: round(balance),
    };
  },

  /** Day book — every posted voucher of the period with its double entry. */
  async dayBook(range: ReportRange = {}) {
    await ensureSeeded();
    const { from, to } = rangeDates(range);
    const query: Record<string, unknown> = baseMatch(range.branchCode);
    if (from || to) {
      query.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const vouchers = await Voucher.find(query)
      .sort({ date: 1, number: 1 })
      .limit(500)
      .lean();
    const totalDebit = round(
      vouchers.reduce(
        (sum, v) => sum + v.lines.reduce((s: number, l: { debit: number }) => s + (l.debit || 0), 0),
        0
      )
    );
    return { vouchers, totalDebit, totalCredit: totalDebit, count: vouchers.length };
  },

  // Legacy cashbook API retained for reports and previous records.
  async list(type?: string | null, branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (type) filter.type = type;
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    return LedgerEntry.find(filter).sort({ date: -1 }).limit(200).lean();
  },

  async summary(branchCode?: string | null) {
    await dbConnect();
    const match: Record<string, unknown> = {};
    if (branchCode) match.branchCode = branchCode.toUpperCase();
    const [rows, bySource, taxRow, voucherCounts] = await Promise.all([
      LedgerEntry.aggregate([
        { $match: match },
        { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      LedgerEntry.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$sourceType",
            income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
            expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          },
        },
      ]),
      LedgerEntry.aggregate([
        { $match: match },
        { $group: { _id: null, tax: { $sum: "$taxAmount" } } },
      ]),
      Voucher.aggregate([
        { $match: match.branchCode ? { branchCode: match.branchCode } : {} },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);
    const income = rows.find((r) => r._id === "income")?.total ?? 0;
    const expense = rows.find((r) => r._id === "expense")?.total ?? 0;
    const sources: Record<string, { income: number; expense: number }> = {};
    for (const s of bySource) sources[s._id || "manual"] = { income: s.income, expense: s.expense };
    return {
      income,
      expense,
      balance: income - expense,
      taxCollected: taxRow[0]?.tax ?? 0,
      bySource: sources,
      vouchers: {
        draft: voucherCounts.find((r) => r._id === "draft")?.count ?? 0,
        posted: voucherCounts.find((r) => r._id === "posted")?.count ?? 0,
        void: voucherCounts.find((r) => r._id === "void")?.count ?? 0,
      },
    };
  },

  async create(data: LedgerInput, userId?: string) {
    await dbConnect();
    const settings = await loadFinanceSettings();
    const tax =
      data.taxAmount != null
        ? { amount: data.amount, taxAmount: data.taxAmount }
        : calcTax(data.amount, settings);
    const cash = await systemAccount(data.method === "bank" || data.method === "online" ? "bank" : "cash");
    const opposite = await systemAccount(data.type === "income" ? "miscIncome" : "generalExpense");
    await createDoubleEntryVoucher(
      {
        voucherType: data.type === "income" ? "receipt" : "payment",
        date: data.date,
        branchCode: data.branchCode || settings.defaultBranchCode || "MAIN",
        narration: data.title,
        reference: data.reference,
        discountAmount: 0,
        taxAmount: 0,
        items: [],
        lines:
          data.type === "income"
            ? [
                { accountCode: cash.code, debit: tax.amount, credit: 0 },
                { accountCode: opposite.code, debit: 0, credit: tax.amount },
              ]
            : [
                { accountCode: opposite.code, debit: tax.amount, credit: 0 },
                { accountCode: cash.code, debit: 0, credit: tax.amount },
              ],
        postNow: true,
      },
      userId
    );
    return LedgerEntry.create({
      ...data,
      amount: tax.amount,
      taxAmount: tax.taxAmount,
      date: new Date(data.date),
      branchCode: (data.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase(),
      sourceType: "manual",
      recordedBy: userId || undefined,
    });
  },

  async upsertLinked(post: LinkedPost) {
    await dbConnect();
    if (post.amount <= 0) {
      await this.removeBySource(post.sourceType, post.sourceId);
      return null;
    }
    const settings = await loadFinanceSettings();
    const tax = post.skipTax
      ? { amount: post.amount, taxAmount: 0 }
      : calcTax(post.amount, settings);
    const date = post.date ? new Date(post.date) : new Date();
    const branchCode = (post.branchCode || settings.defaultBranchCode || "MAIN").toUpperCase();
    const cash = await systemAccount(
      post.method === "bank" || post.method === "online" ? "bank" : "cash"
    );
    let oppositeKey = post.type === "income" ? "miscIncome" : "generalExpense";
    if (post.sourceType === "fee") oppositeKey = "feeIncome";
    if (post.sourceType === "elearning") oppositeKey = "distanceIncome";
    if (post.sourceType === "payslip") oppositeKey = "payrollExpense";
    if (post.sourceType === "inventory") oppositeKey = "inventoryAsset";
    if (post.accountKey) oppositeKey = post.accountKey;
    const opposite = await systemAccount(oppositeKey);
    const taxAccount =
      tax.taxAmount > 0
        ? await systemAccount(post.type === "income" ? "taxPayable" : "taxInput")
        : null;
    const base = round(tax.amount - tax.taxAmount);
    const lines =
      post.type === "income"
        ? [
            { accountCode: cash.code, debit: tax.amount, credit: 0 },
            { accountCode: opposite.code, debit: 0, credit: base },
            ...(taxAccount
              ? [{ accountCode: taxAccount.code, debit: 0, credit: tax.taxAmount }]
              : []),
          ]
        : [
            { accountCode: opposite.code, debit: base, credit: 0 },
            ...(taxAccount
              ? [{ accountCode: taxAccount.code, debit: tax.taxAmount, credit: 0 }]
              : []),
            { accountCode: cash.code, debit: 0, credit: tax.amount },
          ];
    const checked = await enrichAndValidateLines(
      lines,
      post.type === "income" ? "receipt" : "payment"
    );
    const existing = await Voucher.findOne({
      sourceType: post.sourceType,
      sourceId: post.sourceId,
    });
    const voucherPayload = {
      voucherType: post.type === "income" ? "receipt" : "payment",
      status: "posted",
      date,
      branchCode,
      narration: post.title,
      reference: post.reference,
      currency: settings.currency || "PKR",
      subtotal: base,
      discountAmount: 0,
      taxAmount: tax.taxAmount,
      taxName: tax.taxAmount ? settings.taxName || "Tax" : undefined,
      grandTotal: tax.amount,
      items: [],
      lines: checked.lines,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      postedBy: post.recordedBy || undefined,
      postedAt: new Date(),
      voidedAt: undefined,
      voidReason: undefined,
    };
    if (existing) {
      await Voucher.findByIdAndUpdate(existing._id, voucherPayload);
    } else {
      await Voucher.create({
        ...voucherPayload,
        number: await nextVoucherNumber(voucherPayload.voucherType, branchCode, date),
        createdBy: post.recordedBy || undefined,
      });
    }
    const payload = {
      type: post.type,
      category: post.category,
      title: post.title,
      amount: tax.amount,
      taxAmount: tax.taxAmount,
      date,
      method: mapMethod(post.method),
      reference: post.reference,
      notes: post.notes,
      branchCode,
      sourceType: post.sourceType,
      sourceId: post.sourceId,
      recordedBy: post.recordedBy || undefined,
    };
    return LedgerEntry.findOneAndUpdate(
      { sourceType: post.sourceType, sourceId: post.sourceId },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  },

  async removeBySource(sourceType: LedgerSource, sourceId: string) {
    await dbConnect();
    await Promise.all([
      LedgerEntry.deleteMany({ sourceType, sourceId }),
      Voucher.updateMany(
        { sourceType, sourceId, status: { $ne: "void" } },
        {
          $set: {
            status: "void",
            voidedAt: new Date(),
            voidReason: "Source transaction removed or reversed",
          },
        }
      ),
    ]);
    return { ok: true };
  },

  async remove(id: string) {
    await dbConnect();
    const item = await LedgerEntry.findById(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Entry not found", 404);
    if (item.sourceType && item.sourceType !== "manual") {
      throw new ServiceError(
        "CONFLICT",
        `This entry is linked to ${item.sourceType}. Change/delete it from that module instead.`,
        409
      );
    }
    await item.deleteOne();
    return { ok: true };
  },
};
