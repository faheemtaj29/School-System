import { z } from "zod";

export const studentSchema = z.object({
  admissionNo: z.string().optional().or(z.literal("")),
  studentId: z.string().optional().or(z.literal("")),
  formBNo: z.string().optional().or(z.literal("")),
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
  photoUrl: z.string().optional().or(z.literal("")),
  custom: z.record(z.string(), z.unknown()).optional(),
});

export const promoteSchema = z.object({
  classId: z.string().min(1),
  examType: z.string().trim().min(1).optional().nullable(),
  /** When true, only preview who would move — no writes. */
  dryRun: z.boolean().default(false),
  passMark: z.coerce.number().min(1).max(100).default(40),
});

export const studentEnrollmentSchema = z.object({
  kind: z.literal("enrollment"),
  contextType: z.enum(["class", "program_semester", "research_stage"]).default("class"),
  progressionAction: z
    .enum([
      "admission",
      "promotion",
      "semester_promotion",
      "repeat",
      "probation",
      "hold",
      "withdraw",
      "transfer",
      "completion",
      "research_transition",
    ])
    .default("admission"),
  academicYear: z.string().min(2),
  classId: z.string().optional().nullable(),
  className: z.string().optional(),
  section: z.string().optional(),
  institutionCode: z.string().optional(),
  campusCode: z.string().optional(),
  facultyName: z.string().optional(),
  departmentName: z.string().optional(),
  programName: z.string().optional(),
  programCode: z.string().optional(),
  semesterNumber: z.coerce.number().int().min(1).max(20).optional(),
  termName: z.string().optional(),
  batchName: z.string().optional(),
  researchStage: z.string().optional(),
  level: z.coerce.number().int().min(0).optional(),
  stream: z.string().optional(),
  stage: z.string().optional(),
  status: z.enum(["active", "promoted", "completed", "withdrawn", "hold"]).default("active"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  note: z.string().optional(),
  closePrevious: z.boolean().default(false),
});

export type StudentInput = z.infer<typeof studentSchema>;
export type PromoteInput = z.infer<typeof promoteSchema>;
export type StudentEnrollmentInput = z.infer<typeof studentEnrollmentSchema>;
