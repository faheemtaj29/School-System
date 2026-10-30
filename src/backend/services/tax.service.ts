/**
 * Global tax setup: every tax the school deals with (sales tax / GST, withholding, advance tax on
 * fees…) is defined once here, with where it applies — student fee vouchers, payment vouchers,
 * receipt vouchers, store & course sales. Each tax posts to its own liability account in the chart
 * of accounts. Salary income tax has its own slab rules (salaryTax.service).
 */
import { dbConnect } from "@/backend/config/database";
import { Account } from "@/backend/models/Accounting";
import { Tax, type TaxContext, type TaxType } from "@/backend/models/AiModels";
import { ServiceError } from "@/backend/types";

function round(value: number) {
  return Math.round(value * 100) / 100;
}

const CONTEXTS: TaxContext[] = ["fees", "payments", "receipts", "sales"];
const TYPES: TaxType[] = ["vat", "gst", "sales_tax", "withholding", "other"];

export type TaxInput = {
  name?: string;
  code?: string;
  type?: TaxType;
  rate?: number;
  appliesTo?: TaxContext[];
  autoApply?: boolean;
  inclusive?: boolean;
  threshold?: number;
  isActive?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  description?: string;
};

/** Ready-made Pakistan taxes; rates can be changed before saving. */
export const TAX_PRESETS: (TaxInput & { key: string; note: string })[] = [
  {
    key: "fee236i",
    name: "Advance Tax on Fee (236I)",
    code: "ADV236I",
    type: "withholding",
    rate: 5,
    appliesTo: ["fees"],
    autoApply: true,
    threshold: 16667,
    note: "Collected from parents on fee vouchers and paid to FBR. The law applies it when the yearly fee is above Rs 200,000 — the threshold is set to the monthly share (Rs 16,667). Change it if your vouchers cover a different period.",
  },
  {
    key: "gst",
    name: "Sales Tax (GST)",
    code: "GST",
    type: "gst",
    rate: 18,
    appliesTo: ["sales", "receipts", "payments"],
    autoApply: false,
    inclusive: false,
    note: "Added on top of sales and bills. On payments it goes to Input GST; on receipts and sales to GST Payable.",
  },
  {
    key: "wht",
    name: "Withholding Tax on Payments (153)",
    code: "WHT153",
    type: "withholding",
    rate: 0,
    appliesTo: ["payments"],
    autoApply: false,
    note: "Deducted from supplier / contractor payments and paid to FBR. Enter the rate for the supplier's category.",
  },
];

type TaxDoc = {
  _id: unknown;
  name: string;
  code: string;
  type: TaxType;
  rate: number;
  accountCode: string;
  accountName: string;
  appliesTo?: TaxContext[];
  autoApply?: boolean;
  inclusive?: boolean;
  threshold?: number;
  isActive: boolean;
};

/** Withholding / advance taxes come off (or on top of) the amount; never "included". */
export function isWithholding(t: { type: string }) {
  return t.type === "withholding";
}

/** The fee voucher line label for a tax, e.g. "Advance Tax on Fee (236I) @ 5%". */
export function feeTaxHead(t: { name: string; rate: number }) {
  return `${t.name} @ ${t.rate}%`;
}

function activeFilter(context?: TaxContext) {
  const now = new Date();
  return {
    isActive: true,
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: null }, { effectiveTo: { $gte: now } }],
    ...(context ? { appliesTo: context } : {}),
  };
}

/** Each tax gets its own payable account under Tax Liabilities → Output Tax Control. */
async function payableAccount(name: string) {
  const { accountingService } = await import("@/backend/services/accounting.service");
  const acc = await accountingService.createCategory(`${name} Payable`, "liability", undefined, "210201");
  return { code: String(acc.code), name: String(acc.name) };
}

function clean(data: TaxInput) {
  const out: TaxInput = {};
  if (data.name !== undefined) out.name = String(data.name).trim();
  if (data.code !== undefined) out.code = String(data.code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (data.type !== undefined) {
    if (!TYPES.includes(data.type)) throw new ServiceError("VALIDATION", "Unknown tax type", 400);
    out.type = data.type;
  }
  if (data.rate !== undefined) {
    const rate = Number(data.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new ServiceError("VALIDATION", "Rate must be 0–100%", 400);
    out.rate = rate;
  }
  if (data.appliesTo !== undefined) out.appliesTo = [...new Set(data.appliesTo)].filter((c) => CONTEXTS.includes(c));
  if (data.autoApply !== undefined) out.autoApply = Boolean(data.autoApply);
  if (data.inclusive !== undefined) out.inclusive = Boolean(data.inclusive);
  if (data.threshold !== undefined) out.threshold = Math.max(0, Number(data.threshold) || 0);
  if (data.isActive !== undefined) out.isActive = Boolean(data.isActive);
  if (data.effectiveFrom) out.effectiveFrom = data.effectiveFrom;
  if (data.effectiveTo !== undefined) out.effectiveTo = data.effectiveTo || null;
  if (data.description !== undefined) out.description = String(data.description).trim();
  return out;
}

export const taxService = {
  presets() {
    return TAX_PRESETS;
  },

  async list() {
    await dbConnect();
    return Tax.find().sort({ isActive: -1, name: 1 }).lean();
  },

  async active(context?: TaxContext) {
    await dbConnect();
    return Tax.find(activeFilter(context)).sort({ name: 1 }).lean() as Promise<TaxDoc[]>;
  },

  /**
   * Taxes a voucher screen can offer, each with the account it posts to there:
   * GST on a payment is input tax (an asset you claim back); everything else is the tax's payable.
   */
  async forVoucher(context: "payments" | "receipts") {
    const taxes = await this.active(context);
    const input = context === "payments" ? await Account.findOne({ systemKey: "taxInput" }).select("code").lean() : null;
    return taxes
      .filter((t) => context === "payments" || !isWithholding(t))
      .map((t) => ({
        _id: String(t._id),
        name: t.name,
        code: t.code,
        type: t.type,
        rate: t.rate,
        inclusive: Boolean(t.inclusive) && !isWithholding(t),
        threshold: t.threshold || 0,
        autoApply: Boolean(t.autoApply),
        /** "deduct": withheld from the payee; "add": charged on top (or included). */
        mode: isWithholding(t) ? ("deduct" as const) : ("add" as const),
        accountCode: context === "payments" && !isWithholding(t) && input ? String(input.code) : t.accountCode,
      }));
  },

  async create(data: TaxInput) {
    await dbConnect();
    const d = clean(data);
    if (!d.name) throw new ServiceError("VALIDATION", "Give the tax a name", 400);
    const code = d.code || d.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    if (!code) throw new ServiceError("VALIDATION", "Give the tax a short code", 400);
    if (await Tax.exists({ code })) throw new ServiceError("CONFLICT", `Tax code ${code} is already used`, 409);
    const account = await payableAccount(d.name);
    return Tax.create({
      name: d.name,
      code,
      type: d.type || "gst",
      rate: d.rate ?? 0,
      application: "output",
      accountCode: account.code,
      accountName: account.name,
      appliesTo: d.appliesTo || [],
      autoApply: d.autoApply ?? false,
      inclusive: d.inclusive ?? false,
      threshold: d.threshold ?? 0,
      isActive: d.isActive ?? true,
      effectiveFrom: d.effectiveFrom ? new Date(d.effectiveFrom) : new Date(0),
      effectiveTo: d.effectiveTo ? new Date(d.effectiveTo) : undefined,
      description: d.description,
    });
  },

  async update(id: string, data: TaxInput) {
    await dbConnect();
    const doc = await Tax.findById(id);
    if (!doc) throw new ServiceError("NOT_FOUND", "Tax not found", 404);
    const d = clean(data);
    if (d.code && d.code !== doc.code) {
      if (await Tax.exists({ code: d.code, _id: { $ne: id } })) {
        throw new ServiceError("CONFLICT", `Tax code ${d.code} is already used`, 409);
      }
      doc.code = d.code;
    }
    if (d.name) doc.name = d.name;
    if (d.type) doc.type = d.type;
    if (d.rate !== undefined) doc.rate = d.rate;
    if (d.appliesTo) doc.appliesTo = d.appliesTo;
    if (d.autoApply !== undefined) doc.autoApply = d.autoApply;
    if (d.inclusive !== undefined) doc.inclusive = d.inclusive;
    if (d.threshold !== undefined) doc.threshold = d.threshold;
    if (d.isActive !== undefined) doc.isActive = d.isActive;
    if (d.effectiveFrom) doc.effectiveFrom = new Date(d.effectiveFrom);
    if (d.effectiveTo !== undefined) doc.effectiveTo = d.effectiveTo ? new Date(d.effectiveTo) : undefined;
    if (d.description !== undefined) doc.description = d.description;
    await doc.save();
    return doc;
  },

  /** Removes the tax from use. Its account stays in the chart with everything already posted. */
  async remove(id: string) {
    await dbConnect();
    const doc = await Tax.findByIdAndDelete(id);
    if (!doc) throw new ServiceError("NOT_FOUND", "Tax not found", 404);
    return { ok: true };
  },

  /**
   * Fee voucher lines with the fee taxes added: any tax lines already on them are recalculated,
   * so editing a voucher or re-billing never charges a tax twice.
   */
  async withFeeTaxes<T extends { head: string; amount: number; taxCode?: string; taxAccount?: string }>(lines: T[]) {
    await dbConnect();
    const all = await Tax.find({ appliesTo: "fees" }).select("name rate code").lean();
    const taxHeads = new Set(all.map((t) => feeTaxHead(t).toLowerCase()));
    const base = lines.filter((l) => !l.taxCode && !taxHeads.has(l.head.trim().toLowerCase()));
    const subtotal = round(base.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    const taxes = await this.active("fees");
    const extra = taxes
      .filter((t) => t.rate > 0 && subtotal > (t.threshold || 0))
      .map((t) => ({
        head: feeTaxHead(t),
        amount: round((subtotal * t.rate) / 100),
        taxCode: t.code,
        taxAccount: t.accountCode,
      }));
    return [...base, ...extra] as (T & { taxCode?: string; taxAccount?: string })[];
  },

  /**
   * The sales tax used on store and course sales: the first active tax set for "sales".
   * Shaped like the old single-tax settings so existing posting code keeps working.
   */
  async salesTax() {
    const [t] = await this.active("sales");
    if (!t) return null;
    return {
      taxEnabled: t.rate > 0,
      taxRate: t.rate,
      taxInclusive: Boolean(t.inclusive),
      taxName: t.name,
      accountCode: t.accountCode,
    };
  },
};
