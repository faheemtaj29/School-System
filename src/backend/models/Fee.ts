import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IFeeLine {
  head: string;
  amount: number;
  /** Set on a tax line (e.g. advance tax on fee): its tax code and the payable account it posts to. */
  taxCode?: string;
  taxAccount?: string;
}

export interface IFeePayment {
  amount: number;
  date: Date;
  method: "cash" | "card" | "bank" | "online";
  receiptNo: string;
  receivedBy?: string;
  note?: string;
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
  /** Month key (YYYY-MM) for generated monthly challans. */
  billingMonth?: string;
  receiptNo?: string;
  payments?: IFeePayment[];
  /** Challans raised in one go share this, so they can be printed / sent together. */
  issueBatch?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeePaymentSchema = new Schema<IFeePayment>(
  {
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true },
    method: { type: String, enum: ["cash", "card", "bank", "online"], required: true },
    receiptNo: { type: String, required: true, trim: true },
    receivedBy: String,
    note: String,
  },
  { _id: false }
);

const FeeLineSchema = new Schema<IFeeLine>(
  {
    head: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    taxCode: String,
    taxAccount: String,
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
    billingMonth: { type: String, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    receiptNo: { type: String, trim: true },
    payments: { type: [FeePaymentSchema], default: [] },
    issueBatch: { type: String, trim: true, index: true },
  },
  { timestamps: true }
);

export const Fee = models.Fee || model<IFee>("Fee", FeeSchema);
