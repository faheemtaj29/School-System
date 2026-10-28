import { Schema, models, model, Types } from "mongoose";

export interface ILeaveRequest {
  teacherId: Types.ObjectId;
  leaveType: "casual" | "sick" | "annual" | "unpaid" | "other";
  fromDate: Date;
  toDate: Date;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveSchema = new Schema<ILeaveRequest>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    leaveType: {
      type: String,
      enum: ["casual", "sick", "annual", "unpaid", "other"],
      required: true,
    },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 },
    reason: String,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const LeaveRequest =
  models.LeaveRequest || model<ILeaveRequest>("LeaveRequest", LeaveSchema);

/** One named amount on a payslip, e.g. House Rent 8,000 or EOBI 370. */
export interface IPayLine {
  head: string;
  amount: number;
}

const PayLineSchema = new Schema<IPayLine>(
  {
    head: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

export interface IPayslip {
  teacherId: Types.ObjectId;
  month: string;
  basic: number;
  allowances: number;
  /** Part of allowances that is tax-free (e.g. medical allowance). */
  exemptAllowance?: number;
  /** basic + allowances − exempt allowance. */
  taxableIncome?: number;
  /** Salary income tax withheld this month. */
  incomeTax?: number;
  deductions: number;
  /** Itemised allowances (their total is `allowances`) and deductions (total is `deductions`). */
  earnings?: IPayLine[];
  deductionItems?: IPayLine[];
  /** Days in the pay period and days without pay (absent / unpaid leave). */
  workingDays?: number;
  unpaidDays?: number;
  paymentMethod?: "bank" | "cash";
  net: number;
  status: "draft" | "paid" | "pending";
  paidOn?: Date;
  notes?: string;
  branchCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayslipSchema = new Schema<IPayslip>(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    month: { type: String, required: true },
    basic: { type: Number, required: true, min: 0 },
    allowances: { type: Number, default: 0 },
    exemptAllowance: { type: Number, default: 0, min: 0 },
    taxableIncome: { type: Number, default: 0, min: 0 },
    incomeTax: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0 },
    earnings: { type: [PayLineSchema], default: undefined },
    deductionItems: { type: [PayLineSchema], default: undefined },
    workingDays: { type: Number, min: 0 },
    unpaidDays: { type: Number, min: 0, default: 0 },
    paymentMethod: { type: String, enum: ["bank", "cash"] },
    net: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "paid", "pending"],
      default: "pending",
    },
    paidOn: Date,
    notes: String,
    branchCode: { type: String, uppercase: true, trim: true },
  },
  { timestamps: true }
);

PayslipSchema.index({ teacherId: 1, month: 1 }, { unique: true });

export const Payslip = models.Payslip || model<IPayslip>("Payslip", PayslipSchema);
