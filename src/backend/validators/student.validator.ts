import { z } from "zod";

export const studentSchema = z.object({
  admissionNo: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
  classId: z.string().min(1, "Class is required"),
  rollNumber: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email().optional().or(z.literal("")),
  admissionDate: z.string().optional(),
  status: z.enum(["active", "inactive", "graduated"]).default("active"),
  branchCode: z.string().optional(),
});

export type StudentInput = z.infer<typeof studentSchema>;
