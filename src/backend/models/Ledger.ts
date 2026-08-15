import { Schema, models, model, Types } from "mongoose";

export type LedgerSource =
  | "manual"
  | "fee"
  | "payslip"
  | "inventory"
  | "elearning"
  | "other";

export interface ILedgerEntry {
  type: "income" | "expense";
  category: string;
  title: string;
  amount: number;
  taxAmount: number;
  date: Date;
  method?: "cash" | "bank" | "online" | "cheque";
  reference?: string;
  notes?: string;
  branchCode?: string;
  sourceType: LedgerSource;
  sourceId?: Types.ObjectId | string;
  recordedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LedgerSchema = new Schema<ILedgerEntry>(
  {
    type: { type: String, enum: ["income", "expense"], required: true },
    category: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    date: { type: Date, required: true },
    method: { type: String, enum: ["cash", "bank", "online", "cheque"] },
    reference: String,
    notes: String,
    branchCode: { type: String, uppercase: true, trim: true },
    sourceType: {
      type: String,
      enum: ["manual", "fee", "payslip", "inventory", "elearning", "other"],
      default: "manual",
    },
    sourceId: { type: Schema.Types.Mixed },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

LedgerSchema.index({ sourceType: 1, sourceId: 1 });

export const LedgerEntry =
  models.LedgerEntry || model<ILedgerEntry>("LedgerEntry", LedgerSchema);
