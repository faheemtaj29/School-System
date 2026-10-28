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
  /** Bio-data */
  fatherName?: string;
  cnic?: string;
  taxNumber?: string;
  designation?: string;
  department?: string;
  experienceYears?: number;
  maritalStatus?: "single" | "married" | "other";
  bloodGroup?: string;
  city?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  /** Salary defaults used when making payslips, and where it is paid. */
  basicSalary?: number;
  allowances?: number;
  bankName?: string;
  bankAccount?: string;
  /** Photo as a data URL, served by /api/teachers/[id]/photo. */
  photoData?: string;
  photoUpdatedAt?: Date;
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
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: String,
    gender: { type: String, enum: ["male", "female", "other"] },
    dateOfBirth: Date,
    joinDate: Date,
    address: String,
    subjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }],
    classes: [{ type: Schema.Types.ObjectId, ref: "Class" }],
    qualification: String,
    fatherName: String,
    cnic: String,
    taxNumber: String,
    designation: String,
    department: String,
    experienceYears: Number,
    maritalStatus: { type: String, enum: ["single", "married", "other"] },
    bloodGroup: String,
    city: String,
    emergencyName: String,
    emergencyPhone: String,
    basicSalary: { type: Number, min: 0 },
    allowances: { type: Number, min: 0 },
    bankName: String,
    bankAccount: String,
    photoData: { type: String, select: false },
    photoUpdatedAt: Date,
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    branchCode: { type: String, uppercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Teacher = models.Teacher || model<ITeacher>("Teacher", TeacherSchema);
