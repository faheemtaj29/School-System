import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  /** When set, the account must match this portal (admin may use any). */
  expectedRole: z.enum(["admin", "teacher", "student", "staff", "parent"]).optional(),
});

export const studentSignupSchema = z
  .object({
    admissionNo: z.string().trim().min(1),
    email: z.string().email(),
    password: z.string().min(6),
    confirmPassword: z.string().min(6),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const setupAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "teacher", "student", "parent", "staff"]),
  phone: z.string().optional(),
});

/** Admin grants portal access to an existing teacher, student or staff record. */
export const portalAccessSchema = z.object({
  kind: z.enum(["teacher", "student", "staff"]),
  recordId: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(6),
});

export const staffSchema = z.object({
  employeeId: z.string().optional().or(z.literal("")),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  department: z.string().min(1),
  designation: z.string().min(1),
  joinDate: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  branchCode: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type StudentSignupInput = z.infer<typeof studentSignupSchema>;
export type SetupAdminInput = z.infer<typeof setupAdminSchema>;
export type PortalAccessInput = z.infer<typeof portalAccessSchema>;
export type StaffInput = z.infer<typeof staffSchema>;
