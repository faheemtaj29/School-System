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
  },
  { timestamps: true }
);

export const Settings = models.Settings || model<ISettings>("Settings", SettingsSchema);
