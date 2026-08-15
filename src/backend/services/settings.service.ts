import { dbConnect } from "@/backend/config/database";
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
};

type OptionKey = keyof typeof defaults.optionLists;

export const settingsService = {
  async get() {
    await dbConnect();
    let doc = await Settings.findOne().lean();
    if (!doc) {
      const created = await Settings.create(defaults);
      doc = created.toObject();
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
    return doc;
  },

  async update(data: SettingsInput) {
    await dbConnect();
    const current = await Settings.findOne().lean();
    const branches = (data.branches || []).map((b) => ({
      ...b,
      code: b.code.toUpperCase().trim(),
    }));
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
      email: data.email || undefined,
      theme: { ...DEFAULT_THEME, ...(current?.theme || {}), ...(data.theme || {}) },
      branches: branches.length ? branches : defaults.branches,
      defaultBranchCode: (data.defaultBranchCode || branches[0]?.code || "MAIN").toUpperCase(),
      optionLists,
    };
    const doc = await Settings.findOneAndUpdate({}, payload, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
    return doc;
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
    return clean;
  },
};
