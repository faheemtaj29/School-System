import { z } from "zod";

export const teacherSchema = z.object({
  employeeId: z.string().optional().or(z.literal("")),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z.string().optional(),
  joinDate: z.string().optional(),
  address: z.string().optional(),
  subjects: z.array(z.string()).default([]),
  classes: z.array(z.string()).default([]),
  qualification: z.string().optional(),
  fatherName: z.string().optional(),
  cnic: z.string().optional(),
  taxNumber: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  experienceYears: z.coerce.number().min(0).max(70).optional(),
  maritalStatus: z.enum(["single", "married", "other"]).optional(),
  bloodGroup: z.string().optional(),
  city: z.string().optional(),
  emergencyName: z.string().optional(),
  emergencyPhone: z.string().optional(),
  basicSalary: z.coerce.number().min(0).optional(),
  allowances: z.coerce.number().min(0).optional(),
  salaryHeads: z
    .array(
      z.object({
        head: z.string().trim().min(1, "Each salary head needs a name").max(60),
        kind: z.enum(["earning", "deduction"]),
        amount: z.coerce.number().min(0),
      })
    )
    .max(30)
    .optional(),
  employmentType: z.enum(["permanent", "contract", "probation", "visiting"]).optional(),
  paymentMethod: z.enum(["bank", "cash"]).optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  branchCode: z.string().optional(),
});

export type TeacherInput = z.infer<typeof teacherSchema>;
