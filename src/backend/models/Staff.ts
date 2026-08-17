/**
 * Non-teaching staff (clerks, accountants, librarians, etc.).
 * Separate from Teacher so campus ops staff get their own portal.
 */
import { Schema, models, model, Types } from "mongoose";

export interface IStaff {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  joinDate?: Date;
  status: "active" | "inactive";
  branchCode?: string;
  user?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    employeeId: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    department: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    joinDate: Date,
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    branchCode: { type: String, uppercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Staff = models.Staff || model<IStaff>("Staff", StaffSchema);
