import mongoose, { Schema, models, model, Types } from "mongoose";

export interface ITeacher {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: "male" | "female" | "other";
  dateOfBirth?: Date;
  joinDate?: Date;
  address?: string;
  subjects: Types.ObjectId[];
  classes: Types.ObjectId[];
  qualification?: string;
  status: "active" | "inactive";
  branchCode?: string;
  photoUrl?: string;
  user?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: String,
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,
    joinDate: Date,
    address: String,
    subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    classes: [{ type: Schema.Types.ObjectId, ref: "Class" }],
    qualification: String,
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    branchCode: { type: String, uppercase: true, trim: true },
    photoUrl: String,
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Teacher = models.Teacher || model<ITeacher>("Teacher", TeacherSchema);
