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
  cnic?: string;
  address?: string;
  photoData?: string;
  photoUpdatedAt?: Date;
  department: string;
  designation: string;
  joinDate?: Date;
  /** Salary structure, same as teachers: copied onto each month's payslip. */
  basicSalary?: number;
  salaryHeads?: { head: string; kind: "earning" | "deduction"; amount: number }[];
  employmentType?: "permanent" | "contract" | "probation" | "visiting";
  paymentMethod?: "bank" | "cash";
  bankName?: string;
  bankAccount?: string;
  taxNumber?: string;
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
    cnic: { type: String, trim: true },
    address: { type: String, trim: true },
    photoData: { type: String, select: false },
    photoUpdatedAt: Date,
    department: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    joinDate: Date,
    basicSalary: { type: Number, min: 0 },
    salaryHeads: {
      type: [
        new Schema(
          {
            head: { type: String, required: true, trim: true },
            kind: { type: String, enum: ["earning", "deduction"], required: true },
            amount: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    employmentType: { type: String, enum: ["permanent", "contract", "probation", "visiting"] },
    paymentMethod: { type: String, enum: ["bank", "cash"] },
    bankName: String,
    bankAccount: String,
    taxNumber: String,
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    branchCode: { type: String, uppercase: true, trim: true },
    user: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const Staff = models.Staff || model<IStaff>("Staff", StaffSchema);
