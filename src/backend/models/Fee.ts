import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IFee {
  studentId: Types.ObjectId;
  title: string;
  amount: number;
  dueDate: Date;
  status: "pending" | "paid" | "overdue" | "partial";
  paidAmount: number;
  paymentDate?: Date;
  method?: "cash" | "card" | "bank" | "online";
  notes?: string;
  branchCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeeSchema = new Schema<IFee>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    title: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
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
  },
  { timestamps: true }
);

export const Fee = models.Fee || model<IFee>("Fee", FeeSchema);
