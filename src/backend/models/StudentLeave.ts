import { Schema, models, model, Types } from "mongoose";

export interface IStudentLeaveRequest {
  studentId: Types.ObjectId;
  leaveType: "casual" | "sick" | "annual" | "unpaid" | "other";
  fromDate: Date;
  toDate: Date;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  submittedBy: Types.ObjectId;
  reviewedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentLeaveSchema = new Schema<IStudentLeaveRequest>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    leaveType: { type: String, enum: ["casual", "sick", "annual", "unpaid", "other"], required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 1 },
    reason: { type: String, trim: true, maxlength: 1000 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

StudentLeaveSchema.index({ status: 1, fromDate: 1, toDate: 1 });

export const StudentLeaveRequest =
  models.StudentLeaveRequest || model<IStudentLeaveRequest>("StudentLeaveRequest", StudentLeaveSchema);
