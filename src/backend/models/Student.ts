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
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Student = models.Student || model<IStudent>("Student", StudentSchema);
