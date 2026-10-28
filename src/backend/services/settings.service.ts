import { dbConnect } from "@/backend/config/database";
import { ServiceError } from "@/backend/types";
import { normalizeCurrency } from "@/lib/currency";
import { Settings } from "@/backend/models/Settings";
import { DEFAULT_THEME } from "@/lib/theme";
import type { z } from "zod";
import type { settingsSchema } from "@/backend/validators/modules.validator";

type SettingsInput = z.infer<typeof settingsSchema>;

const defaults = {
  schoolName: "Sabaq Model School",
  academicYear: "2026–27",
  feeDueDay: 25,
  currency: "PKR",
  smsFeeReminders: true,
  whatsappAttendance: true,
  emailResults: false,
  taxEnabled: false,
  taxName: "GST",
  taxRate: 0,
  taxInclusive: true,
  defaultBranchCode: "MAIN",
  branches: [{ code: "MAIN", name: "Main Campus" }],
  optionLists: {
    ledgerCategories: ["Student Fees", "Distance Learning", "Donations", "Payroll", "Inventory / Store", "Utilities", "Maintenance"],
    inventoryCategories: ["Stationery", "Uniforms", "Books", "IT Equipment", "Lab Supplies", "Furniture", "Sports"],
    inventoryUnits: ["pcs", "box", "pack", "set", "kg", "litre", "ream"],
    inventoryLocations: ["Main Store", "Office", "Library", "Computer Lab", "Science Lab"],
    suppliers: [],
    feeHeads: ["Tuition Fee", "Admission Fee", "Exam Fee", "Transport Fee", "Library Fee", "Course Fee"],
  },
  theme: DEFAULT_THEME,
  institutionCode: "MAIN",
  institutionType: "school" as const,
  passPercent: 40,
  attendanceAlertPercent: 75,
  studentIdMode: "auto" as const,
  employeeIdMode: "auto" as const,
  lateFeePercent: 5,
  lateFeeGraceDays: 7,
  challanValidityDays: 5,
  challanBanks: "",
  challanNotes: "",
  whtRate: 0,
  admissionPrefix: "STD",
  receiptPrefix: "RCP",
};

/** Public URL for the uploaded logo; the version param busts browser caches. */
function logoUrl(doc: { logoUpdatedAt?: Date | string | null }) {
  return doc.logoUpdatedAt
    ? `/api/settings/logo?v=${new Date(doc.logoUpdatedAt).getTime()}`
    : null;
}

type OptionKey = keyof typeof defaults.optionLists;

export const settingsService = {
  async get() {
    await dbConnect();
    let doc = await Settings.findOne().lean();
    if (!doc) {
      const created = await Settings.create(defaults);
      doc = created.toObject();
    }
    // Older versions saved the uploaded logo as a data URL in `logoUrl`; move it to logoData once.
    if (typeof doc.logoUrl === "string" && doc.logoUrl.startsWith("data:image/") && !doc.logoUpdatedAt) {
      const logoUpdatedAt = new Date();
      await Settings.updateOne(
        { _id: doc._id },
        { $set: { logoData: doc.logoUrl, logoUpdatedAt }, $unset: { logoUrl: 1 } }
      );
      doc = { ...doc, logoUpdatedAt, logoUrl: undefined };
    }
    // Older versions stored a typed symbol ("₹", "Rs"); keep a proper currency code instead.
    const currency = normalizeCurrency(doc.currency);
    if (currency !== doc.currency) {
      await Settings.updateOne({ _id: doc._id }, { $set: { currency } });
      doc = { ...doc, currency };
    }
    if (!doc.branches?.length) {
      doc = {
        ...doc,
        branches: defaults.branches,
        defaultBranchCode: doc.defaultBranchCode || "MAIN",
      };
    }
    doc = {
      ...doc,
      optionLists: {
        ...defaults.optionLists,
        ...(doc.optionLists || {}),
      },
      theme: { ...DEFAULT_THEME, ...(doc.theme || {}) },
    };
    return { ...doc, logoUrl: logoUrl(doc) };
  },

  async update(data: SettingsInput) {
    await dbConnect();
    // The logo is managed by /api/settings/logo; never overwrite it from the profile form.
    delete (data as { logoUrl?: string }).logoUrl;
    const current = await Settings.findOne().lean();
    const branches = (data.branches || []).map((b) => {
      const code = b.code.toUpperCase().trim();
      // The campus logo is uploaded separately; saving the form must not drop it.
      const before = (current?.branches || []).find((x: { code: string }) => x.code === code) as { logoUpdatedAt?: Date } | undefined;
      return { ...b, code, ...(before?.logoUpdatedAt ? { logoUpdatedAt: before.logoUpdatedAt } : {}) };
    });
    const optionLists = Object.fromEntries(
      (Object.keys(defaults.optionLists) as OptionKey[]).map((key) => [
        key,
        Array.from(
          new Set([
            ...defaults.optionLists[key],
            ...(current?.optionLists?.[key] || []),
            ...(data.optionLists?.[key] || []),
          ])
        ),
      ])
    ) as typeof defaults.optionLists;
    const payload = {
      ...data,
      currency: normalizeCurrency(data.currency),
      email: data.email || undefined,
      admissionPrefix: data.admissionPrefix?.toUpperCase() || current?.admissionPrefix || "STD",
      receiptPrefix: data.receiptPrefix?.toUpperCase() || current?.receiptPrefix || "RCP",
      theme: { ...DEFAULT_THEME, ...(current?.theme || {}), ...(data.theme || {}) },
      branches: branches.length ? branches : defaults.branches,
      defaultBranchCode: (data.defaultBranchCode || branches[0]?.code || "MAIN").toUpperCase(),
      optionLists,
    };
    const doc = await Settings.findOneAndUpdate({}, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }).lean();
    const { accountingService } = await import("@/backend/services/accounting.service");
    await accountingService.ensureFeeHeadAccounts(optionLists.feeHeads || []);
    return { ...doc, logoUrl: logoUrl(doc) };
  },

  async getLogo() {
    await dbConnect();
    const doc = await Settings.findOne().select("+logoData logoUpdatedAt").lean();
    return doc?.logoData ? { data: doc.logoData as string, updatedAt: doc.logoUpdatedAt } : null;
  },

  /** A campus's own logo, or null when it uses the school logo. */
  async getBranchLogo(code: string) {
    await dbConnect();
    const key = code.toUpperCase();
    const doc = await Settings.findOne().select("+branchLogos branches").lean();
    const data = doc?.branchLogos?.[key];
    if (!data) return null;
    const b = (doc?.branches || []).find((x: { code: string }) => x.code === key) as { logoUpdatedAt?: Date } | undefined;
    return { data: data as string, updatedAt: b?.logoUpdatedAt };
  },

  /** Upload (or remove, with null) a campus's own logo; it then heads that campus's documents. */
  async setBranchLogo(code: string, dataUrl: string | null) {
    await dbConnect();
    const key = code.toUpperCase();
    if (!/^[A-Z0-9_-]{1,20}$/.test(key)) throw new ServiceError("VALIDATION", "Invalid campus code", 400);
    const doc = await Settings.findOne({ "branches.code": key }).select("_id").lean();
    if (!doc) throw new ServiceError("NOT_FOUND", "Campus not found", 404);
    const now = new Date();
    await Settings.updateOne(
      { _id: doc._id, "branches.code": key },
      dataUrl
        ? { $set: { [`branchLogos.${key}`]: dataUrl, "branches.$.logoUpdatedAt": now } }
        : { $unset: { [`branchLogos.${key}`]: 1, "branches.$.logoUpdatedAt": 1 } }
    );
    return dataUrl ? `/api/settings/logo?branch=${key}&v=${now.getTime()}` : null;
  },

  async setLogo(dataUrl: string | null) {
    await dbConnect();
    const update = dataUrl
      ? { $set: { logoData: dataUrl, logoUpdatedAt: new Date() } }
      : { $unset: { logoData: 1, logoUpdatedAt: 1 } };
    const doc = await Settings.findOneAndUpdate({}, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }).lean();
    return logoUrl(doc || {});
  },

  async addOption(key: OptionKey, value: string) {
    await dbConnect();
    const clean = value.trim();
    await Settings.findOneAndUpdate(
      {},
      {
        $setOnInsert: defaults,
        $addToSet: { [`optionLists.${key}`]: clean },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // A new fee head gets its own income account in the chart of accounts straight away.
    if (key === "feeHeads") {
      const { accountingService } = await import("@/backend/services/accounting.service");
      await accountingService.feeHeadAccount(clean);
    }
    return clean;
  },
};
