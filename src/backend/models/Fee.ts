import { Schema, models, model, Types } from "mongoose";

export interface IFeeLine {
  head: string;
  amount: number;
  /** Optional COA account code this fee head maps to (income account) */
  accountCode?: string;
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
    accountCode: { type: String, trim: true },
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

export type FeePaymentStatus = "posted" | "reversed";

export interface IFeePayment {
  feeId: Types.ObjectId;
  studentId: Types.ObjectId;
  receiptNumber: string;
  idempotencyKey: string;
  amount: number;
  method: "cash" | "card" | "bank" | "online";
  depositAccountCode: string;
  paymentDate: Date;
  transactionReference?: string;
  voucherId: Types.ObjectId;
  voucherNumber: string;
  status: FeePaymentStatus;
  receivedBy?: Types.ObjectId;
  reversedAt?: Date;
  reversedBy?: Types.ObjectId;
  reversalReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeePaymentSchema = new Schema<IFeePayment>(
  {
    feeId: { type: Schema.Types.ObjectId, ref: "Fee", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    receiptNumber: { type: String, required: true, unique: true, trim: true },
    idempotencyKey: { type: String, required: true, unique: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: ["cash", "card", "bank", "online"], required: true },
    depositAccountCode: { type: String, required: true, trim: true },
    paymentDate: { type: Date, required: true },
    transactionReference: { type: String, trim: true },
    voucherId: { type: Schema.Types.ObjectId, ref: "Voucher", required: true },
    voucherNumber: { type: String, required: true, trim: true },
    status: { type: String, enum: ["posted", "reversed"], default: "posted", required: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reversedAt: Date,
    reversedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reversalReason: String,
  },
  { timestamps: true }
);

FeePaymentSchema.index({ feeId: 1, paymentDate: -1 });
FeePaymentSchema.index({ studentId: 1, paymentDate: -1 });

export const FeePayment =
  models.FeePayment || model<IFeePayment>("FeePayment", FeePaymentSchema);
