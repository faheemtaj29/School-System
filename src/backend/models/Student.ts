import mongoose, { Schema, models, model, Types } from "mongoose";

export interface IStudent {
  admissionNo: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: "male" | "female" | "other";
  dateOfBirth?: Date;
  address?: string;
  classId: Types.ObjectId;
  rollNumber?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  admissionDate?: Date;
  status: "active" | "inactive" | "graduated";
  branchCode?: string;
  /** Fee concession category — applied automatically on voucher generation. */
  discountType?:
    | "none"
    | "teacher_child"
    | "staff_child"
    | "sibling"
    | "merit"
    | "need_based"
    | "custom";
  discountPercent?: number;
  linkedTeacherId?: Types.ObjectId;
  /** Extensible key/value bag for CustomField definitions. */
  custom?: Record<string, unknown>;
  user?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    admissionNo: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: String,
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,
    address: String,
    classId: { type: Schema.Types.ObjectId, ref: "Class", required: true },
    rollNumber: String,
    parentName: String,
    parentPhone: String,
    parentEmail: String,
    admissionDate: Date,
    status: {
      type: String,
      enum: ["active", "inactive", "graduated"],
      default: "active",
    },
    branchCode: { type: String, uppercase: true, trim: true },
    discountType: {
      type: String,
      enum: ["none", "teacher_child", "staff_child", "sibling", "merit", "need_based", "custom"],
      default: "none",
    },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    linkedTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher" },
    custom: { type: Schema.Types.Mixed, default: {} },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Student = models.Student || model<IStudent>("Student", StudentSchema);
