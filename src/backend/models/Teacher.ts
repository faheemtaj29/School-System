import { Schema, models, model, Types } from "mongoose";

export interface ITeacher {
  employeeId: string;
  firstName: string;
  lastName: string;
  profilePhoto?: string;
  email: string;
  phone?: string;
  gender?: "male" | "female" | "other";
  dateOfBirth?: Date;
  joinDate?: Date;
  address?: string;
  designation?: string;
  department?: string;
  subjects: Types.ObjectId[];
  classes: Types.ObjectId[];
  qualification?: string;
  status: "active" | "inactive";
  branchCode?: string;
  user?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TeacherSchema = new Schema<ITeacher>(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    profilePhoto: { type: String, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: String,
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,
    joinDate: Date,
    address: String,
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    classes: [{ type: Schema.Types.ObjectId, ref: "Class" }],
    qualification: String,
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    branchCode: { type: String, uppercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Teacher = models.Teacher || model<ITeacher>("Teacher", TeacherSchema);
