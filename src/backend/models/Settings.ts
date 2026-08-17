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

export interface IGradeBand {
  minPercent: number;
  maxPercent: number;
  label: string;
  gradePoint: number;
  pass: boolean;
}

/** Singleton-style school settings — profile, tax, branches, theme (lean hub). */
export interface ISettings {
  schoolName: string;
  registrationNo?: string;
  academicYear: string;
  feeDueDay: number;
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
  gradingScale?: IGradeBand[];
  createdAt: Date;
  updatedAt: Date;
}

const GradeBandSchema = new Schema<IGradeBand>(
  {
    minPercent: { type: Number, required: true, min: 0, max: 100 },
    maxPercent: { type: Number, required: true, min: 0, max: 100 },
    label: { type: String, required: true, trim: true },
    gradePoint: { type: Number, required: true, min: 0, max: 5 },
    pass: { type: Boolean, default: true },
  },
  { _id: false }
);

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
    feeDueDay: { type: Number, default: 25 },
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
    gradingScale: {
      type: [GradeBandSchema],
      default: [
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
    },
  },
  { timestamps: true }
);

export const Settings = models.Settings || model<ISettings>("Settings", SettingsSchema);
