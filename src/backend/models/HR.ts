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

export interface IPayslip {
  teacherId: Types.ObjectId;
  month: string;
  basic: number;
  allowances: number;
  deductions: number;
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
    deductions: { type: Number, default: 0 },
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
