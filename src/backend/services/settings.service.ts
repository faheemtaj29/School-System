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
  institutionCode: "MAIN",
  institutionType: "school" as const,
  passPercent: 40,
  attendanceAlertPercent: 75,
  studentIdMode: "auto" as const,
  employeeIdMode: "auto" as const,
  lateFeePercent: 5,
  lateFeeGraceDays: 7,
  whtRate: 0,
  gradingScale: [
    { minPercent: 85, maxPercent: 100, label: "A+", gradePoint: 4, pass: true },
    { minPercent: 80, maxPercent: 84.99, label: "A", gradePoint: 3.7, pass: true },
    { minPercent: 75, maxPercent: 79.99, label: "B+", gradePoint: 3.3, pass: true },
    { minPercent: 70, maxPercent: 74.99, label: "B", gradePoint: 3, pass: true },
    { minPercent: 65, maxPercent: 69.99, label: "C+", gradePoint: 2.7, pass: true },
    { minPercent: 60, maxPercent: 64.99, label: "C", gradePoint: 2.3, pass: true },
    { minPercent: 55, maxPercent: 59.99, label: "D+", gradePoint: 2, pass: true },
    { minPercent: 50, maxPercent: 54.99, label: "D", gradePoint: 1.7, pass: true },
    { minPercent: 45, maxPercent: 49.99, label: "E", gradePoint: 1.3, pass: true },
    { minPercent: 40, maxPercent: 44.99, label: "P", gradePoint: 1, pass: true },
    { minPercent: 0, maxPercent: 39.99, label: "F", gradePoint: 0, pass: false },
  ],
};

type OptionKey = keyof typeof defaults.optionLists;

let settingsCache: { value: any; expiresAt: number } | null = null;

export const settingsService = {
  async get() {
    if (settingsCache && settingsCache.expiresAt > Date.now()) return settingsCache.value;
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
    settingsCache = { value: doc, expiresAt: Date.now() + 30_000 };
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
    settingsCache = null;
    return doc;
  },

  async addOption(key: OptionKey, value: string) {
    await dbConnect();
    const clean = value.trim();
    if (!clean) return clean;

    // Step 1: ensure a settings document exists.
    // Keep this separate from nested optionLists update to avoid Mongo path conflicts.
    await Settings.findOneAndUpdate(
      {},
      { $setOnInsert: defaults },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // Step 2: update only the target option list key.
    await Settings.updateOne({}, { $addToSet: { [`optionLists.${key}`]: clean } });
    settingsCache = null;
    return clean;
  },
};
