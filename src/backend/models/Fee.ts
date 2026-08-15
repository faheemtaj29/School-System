import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IFeeLine {
  head: string;
  amount: number;
}

export interface IFee {
  studentId: Types.ObjectId;
  title: string;
  /** Fee heads billed on this challan — one row per head. */
  lines: IFeeLine[];
  /** Gross amount before concession. */
  originalAmount?: number;
  amount: number;
  discountPercent?: number;
  discountAmount?: number;
  discountType?: string;
  dueDate: Date;
  status: "pending" | "paid" | "overdue" | "partial";
  paidAmount: number;
  paymentDate?: Date;
  method?: "cash" | "card" | "bank" | "online";
  notes?: string;
  branchCode?: string;
  /** Installment plan — parent voucher id (self for first / group key). */
  installmentGroup?: string;
  installmentNo?: number;
  installmentTotal?: number;
  lateFeeAmount?: number;
  lateFeeApplied?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const FeeLineSchema = new Schema<IFeeLine>(
  {
    head: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const FeeSchema = new Schema<IFee>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    title: { type: String, required: true, trim: true },
    lines: { type: [FeeLineSchema], default: [] },
    originalAmount: { type: Number, min: 0 },
    amount: { type: Number, required: true },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0 },
    discountType: String,
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "paid", "overdue", "partial"],
      default: "pending",
    },
    paidAmount: { type: Number, default: 0 },
    paymentDate: Date,
    method: { type: String, enum: ["cash", "card", "bank", "online"] },
    notes: String,
    branchCode: { type: String, uppercase: true, trim: true },
    installmentGroup: { type: String, trim: true },
    installmentNo: { type: Number, min: 1 },
    installmentTotal: { type: Number, min: 1 },
    lateFeeAmount: { type: Number, default: 0, min: 0 },
    lateFeeApplied: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Fee = models.Fee || model<IFee>("Fee", FeeSchema);
