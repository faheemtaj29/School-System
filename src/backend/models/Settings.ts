import { Schema, models, model } from "mongoose";

export interface IBranch {
  code: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface IOptionLists {
  ledgerCategories: string[];
  inventoryCategories: string[];
  inventoryUnits: string[];
  inventoryLocations: string[];
  suppliers: string[];
  feeHeads: string[];
}

export interface ITheme {
  preset: string;
  primary: string;
  accent: string;
  sidebar: string;
  surface: string;
  radius: number;
  solid: boolean;
}

/** Singleton-style school settings — profile, tax, branches, theme (lean hub). */
export interface ISettings {
  schoolName: string;
  registrationNo?: string;
  academicYear: string;
  feeDueDay: number;
  autoMonthlyFees?: boolean;
  feeGenerateDay?: number;
  lastAutoFeeMonth?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  smsFeeReminders: boolean;
  whatsappAttendance: boolean;
  emailResults: boolean;
  primaryColor?: string;
  /** Tax / GST */
  taxEnabled: boolean;
  taxName: string;
  taxRate: number;
  taxInclusive: boolean;
  /** Multi-campus */
  defaultBranchCode: string;
  branches: IBranch[];
  /** Admin-managed reusable dropdown values. */
  optionLists: IOptionLists;
  /** Look & feel applied across the dashboard, login and public site. */
  theme: ITheme;
  /** Multi-tenant prep — maps this deployment to an Institution code. */
  institutionCode?: string;
  institutionType?: "school" | "college" | "university" | "academy";
  /** Automation thresholds used across promotion & attendance alerts. */
  passPercent?: number;
  attendanceAlertPercent?: number;
  /** Business ID generation — auto suggests/allocates; manual requires typed code. */
  studentIdMode?: "auto" | "manual";
  employeeIdMode?: "auto" | "manual";
  /** Late fee engine — percent of unpaid balance after grace days. */
  lateFeePercent?: number;
  lateFeeGraceDays?: number;
  /** Withholding tax % for vendor payments (FBR-style). */
  whtRate?: number;
  /** Prefix for auto-generated admission numbers, e.g. ADM → ADM-MAIN-2026-00001. */
  admissionPrefix?: string;
  /** Prefix for fee receipt numbers, e.g. RCP → RCP-MAIN-2026-00001. */
  receiptPrefix?: string;
  /** UDISE+ school code (India) — printed on transfer certificates. */
  udiseCode?: string;
  /** School logo as a data URL; excluded from normal reads, served by /api/settings/logo. */
  logoData?: string;
  logoUpdatedAt?: Date;
  /** Older versions kept the logo here as a data URL; moved to logoData on first read. */
  logoUrl?: string;
  motto?: string;
  website?: string;
  city?: string;
  province?: string;
  country?: string;
  principalName?: string;
  boardName?: string;
  fax?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BranchSchema = new Schema<IBranch>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    address: String,
    phone: String,
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    schoolName: { type: String, required: true, default: "Sabaq Model School" },
    registrationNo: String,
    academicYear: { type: String, default: "2026–27" },
    feeDueDay: { type: Number, default: 25, min: 1, max: 28 },
    autoMonthlyFees: { type: Boolean, default: false },
    feeGenerateDay: { type: Number, default: 1, min: 1, max: 28 },
    lastAutoFeeMonth: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    address: String,
    phone: String,
    email: String,
    currency: { type: String, default: "PKR" },
    smsFeeReminders: { type: Boolean, default: true },
    whatsappAttendance: { type: Boolean, default: true },
    emailResults: { type: Boolean, default: false },
    primaryColor: { type: String, default: "#157A5C" },
    taxEnabled: { type: Boolean, default: false },
    taxName: { type: String, default: "GST" },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    taxInclusive: { type: Boolean, default: true },
    defaultBranchCode: { type: String, default: "MAIN", uppercase: true },
    branches: {
      type: [BranchSchema],
      default: [{ code: "MAIN", name: "Main Campus" }],
    },
    optionLists: {
      ledgerCategories: {
        type: [String],
        default: ["Student Fees", "Distance Learning", "Donations", "Payroll", "Inventory / Store", "Utilities", "Maintenance"],
      },
      inventoryCategories: {
        type: [String],
        default: ["Stationery", "Uniforms", "Books", "IT Equipment", "Lab Supplies", "Furniture", "Sports"],
      },
      inventoryUnits: {
        type: [String],
        default: ["pcs", "box", "pack", "set", "kg", "litre", "ream"],
      },
      inventoryLocations: {
        type: [String],
        default: ["Main Store", "Office", "Library", "Computer Lab", "Science Lab"],
      },
      suppliers: { type: [String], default: [] },
      feeHeads: {
        type: [String],
        default: ["Tuition Fee", "Admission Fee", "Exam Fee", "Transport Fee", "Library Fee", "Course Fee"],
      },
    },
    theme: {
      preset: { type: String, default: "jade" },
      primary: { type: String, default: "#157A5C" },
      accent: { type: String, default: "#E8992E" },
      sidebar: { type: String, default: "#0E211A" },
      surface: { type: String, default: "#F4F6F2" },
      radius: { type: Number, default: 14, min: 0, max: 28 },
      solid: { type: Boolean, default: true },
    },
    institutionCode: { type: String, uppercase: true, trim: true, default: "MAIN" },
    institutionType: {
      type: String,
      enum: ["school", "college", "university", "academy"],
      default: "school",
    },
    passPercent: { type: Number, default: 40, min: 1, max: 100 },
    attendanceAlertPercent: { type: Number, default: 75, min: 1, max: 100 },
    studentIdMode: { type: String, enum: ["auto", "manual"], default: "auto" },
    employeeIdMode: { type: String, enum: ["auto", "manual"], default: "auto" },
    lateFeePercent: { type: Number, default: 5, min: 0, max: 100 },
    lateFeeGraceDays: { type: Number, default: 7, min: 0, max: 90 },
    whtRate: { type: Number, default: 0, min: 0, max: 100 },
    admissionPrefix: { type: String, uppercase: true, trim: true, default: "STD" },
    receiptPrefix: { type: String, uppercase: true, trim: true, default: "RCP" },
    udiseCode: { type: String, trim: true },
    logoData: { type: String, select: false },
    logoUpdatedAt: Date,
    logoUrl: String,
    motto: String,
    website: String,
    city: String,
    province: String,
    country: { type: String, default: "Pakistan" },
    principalName: String,
    boardName: String,
    fax: String,
  },
  { timestamps: true }
);

export const Settings = models.Settings || model<ISettings>("Settings", SettingsSchema);
