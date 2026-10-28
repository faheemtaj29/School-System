import { z } from "zod";

export const teacherSchema = z.object({
  employeeId: z.string().optional().or(z.literal("")),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  profilePhoto: z.string().regex(/^\/uploads\/profiles\/[a-f0-9-]+\.(jpg|png|webp)$/i).optional().or(z.literal("")),
  email: z.string().email(),
  phone: z.string().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  dateOfBirth: z.string().optional(),
  joinDate: z.string().optional(),
  address: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  subjects: z.array(z.string()).default([]),
  classes: z.array(z.string()).default([]),
  qualification: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  branchCode: z.string().optional(),
});

export type TeacherInput = z.infer<typeof teacherSchema>;
