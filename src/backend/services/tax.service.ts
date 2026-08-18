/**
 * Centralized Tax Engine.
 * All tax calculations flow through here — never hard-code tax in voucher screens.
 */
import { dbConnect } from "@/backend/config/database";
import { Tax } from "@/backend/models/AiModels";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export interface TaxRateResult {
  rate: number;
  taxAmount: number;
  netAmount: number;
  grossAmount: number;
  taxAccountCode: string;
  taxAccountName: string;
  taxType: string;
}

export interface TaxSplit {
  inputTax: number;
  outputTax: number;
  inputAccountCode: string;
  outputAccountCode: string;
}

export const taxService = {
  async list() {
    await dbConnect();
    return Tax.find().sort({ code: 1 }).lean();
  },

  async active() {
    await dbConnect();
    const now = new Date();
    return Tax.find({
      isActive: true,
      effectiveFrom: { $lte: now },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gte: now } }],
    }).sort({ code: 1 }).lean();
  },

  async create(data: {
    name: string;
    code: string;
    type: "vat" | "gst" | "sales_tax" | "withholding" | "other";
    rate: number;
    application: "input" | "output";
    accountCode: string;
    accountName: string;
    effectiveFrom?: string;
    effectiveTo?: string;
    description?: string;
  }) {
    await dbConnect();
    const exists = await Tax.findOne({ code: data.code.toUpperCase() });
    if (exists) {
      throw new ServiceError("CONFLICT", "Tax code already exists", 409);
    }
    return Tax.create({
      ...data,
      code: data.code.toUpperCase(),
      isActive: true,
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
      effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : undefined,
    });
  },

  async update(id: string, data: {
    name?: string;
    rate?: number;
    isActive?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string;
    description?: string;
  }) {
    await dbConnect();
    const doc = await Tax.findById(id);
    if (!doc) throw new ServiceError("NOT_FOUND", "Tax not found", 404);
    if (data.name !== undefined) doc.name = data.name;
    if (data.rate !== undefined) doc.rate = Math.max(0, Math.min(100, data.rate));
    if (data.isActive !== undefined) doc.isActive = data.isActive;
    if (data.effectiveFrom !== undefined) doc.effectiveFrom = new Date(data.effectiveFrom);
    if (data.effectiveTo !== undefined) doc.effectiveTo = new Date(data.effectiveTo);
    if (data.description !== undefined) doc.description = data.description;
    await doc.save();
    return doc;
  },

  async setActive(id: string, isActive: boolean) {
    await dbConnect();
    const doc = await Tax.findById(id);
    if (!doc) throw new ServiceError("NOT_FOUND", "Tax not found", 404);
    doc.isActive = isActive;
    await doc.save();
    return doc;
  },

  async applicableRates(application: "input" | "output", date = new Date()) {
    await dbConnect();
    return Tax.find({
      application,
      isActive: true,
      effectiveFrom: { $lte: date },
      $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gte: date } }],
    }).sort({ code: 1 }).lean();
  },

  async calcForAmount(amount: number, application: "input" | "output", taxCode?: string) {
    await dbConnect();
    const settings = await Settings.findOne().lean();
    const enabled = settings?.taxEnabled;
    const defaultRate = settings?.taxRate || 0;
    const inclusive = settings?.taxInclusive ?? true;

    if (!enabled || amount <= 0) {
      return {
        rate: 0,
        taxAmount: 0,
        netAmount: amount,
        grossAmount: amount,
        taxAccountCode: "",
        taxAccountName: "",
        taxType: "",
      } satisfies TaxRateResult;
    }

    let rate = defaultRate;
    let accountCode = "";
    let accountName = "";
    let taxType = "";

    if (taxCode) {
      const tax = await Tax.findOne({ code: taxCode.toUpperCase(), isActive: true }).lean();
      if (tax) {
        rate = tax.rate;
        accountCode = tax.accountCode;
        accountName = tax.accountName;
        taxType = tax.type;
      }
    }

    if (!accountCode) {
      const fallback = application === "input" ? "taxInput" : "taxPayable";
      const sysAccount = await Tax.findOne({ application, isActive: true }).lean();
      if (sysAccount) {
        accountCode = sysAccount.accountCode;
        accountName = sysAccount.accountName;
      }
    }

    const r = rate / 100;
    let taxAmount: number;
    let netAmount: number;
    let grossAmount: number;

    if (inclusive) {
      taxAmount = round((amount * r) / (1 + r));
      netAmount = round(amount - taxAmount);
      grossAmount = round(amount);
    } else {
      taxAmount = round(amount * r);
      netAmount = round(amount);
      grossAmount = round(amount + taxAmount);
    }

    return {
      rate,
      taxAmount,
      netAmount,
      grossAmount,
      taxAccountCode: accountCode,
      taxAccountName: accountName,
      taxType,
    } satisfies TaxRateResult;
  },

  async splitForVoucher(subtotal: number, taxAmount: number) {
    await dbConnect();
    const inputTaxes = await this.applicableRates("input");
    const outputTaxes = await this.applicableRates("output");

    const inputAccountCode = inputTaxes[0]?.accountCode || "";
    const outputAccountCode = outputTaxes[0]?.accountCode || "";

    const totalTaxRate = inputTaxes.reduce((s, t) => s + t.rate, 0) + outputTaxes.reduce((s, t) => s + t.rate, 0);
    const inputRatio = totalTaxRate > 0 ? inputTaxes.reduce((s, t) => s + t.rate, 0) / totalTaxRate : 0.5;

    const inputTax = round(taxAmount * inputRatio);
    const outputTax = round(taxAmount - inputTax);

    return {
      inputTax,
      outputTax,
      inputAccountCode,
      outputAccountCode,
    } satisfies TaxSplit;
  },
};
