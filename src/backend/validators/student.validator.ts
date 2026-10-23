import { z } from "zod";

export const studentSchema = z.object({
  admissionNo: z.string().optional().or(z.literal("")),
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
  discountType: z
    .enum(["none", "teacher_child", "staff_child", "sibling", "merit", "need_based", "custom"])
    .default("none"),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  linkedTeacherId: z.string().optional().nullable(),
  custom: z.record(z.string(), z.unknown()).optional(),
  cnic: z.string().optional(),
  nationality: z.string().optional(),
  religion: z.string().optional(),
  previousSchool: z.string().optional(),
});

export const issueTcSchema = z.object({
  kind: z.literal("issue-tc"),
  leavingDate: z.string().min(1),
  leavingReason: z.string().optional(),
  conductRemark: z.string().optional(),
});

export const promoteSchema = z.object({
  classId: z.string().min(1),
  examType: z.enum(["quiz", "midterm", "final", "assignment"]).optional().nullable(),
  /** When true, only preview who would move — no writes. */
  dryRun: z.boolean().default(false),
  passMark: z.coerce.number().min(1).max(100).default(40),
});

/** Bulk-promote ALL students in a class to a target class, no exam filter. */
export const promoteAllSchema = z.object({
  kind: z.literal("promote-all"),
  fromClassId: z.string().min(1),
  toClassId: z.string().min(1),
});

export type StudentInput = z.infer<typeof studentSchema>;
export type PromoteInput = z.infer<typeof promoteSchema>;
export type PromoteAllInput = z.infer<typeof promoteAllSchema>;
export type IssueTcInput = z.infer<typeof issueTcSchema>;
