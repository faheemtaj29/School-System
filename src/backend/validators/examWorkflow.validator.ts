import { z } from "zod";

export const examTypeSchema = z.object({
  key: z.string().min(2).max(40),
  name: z.string().min(2).max(80),
  category: z.enum(["school", "college", "university", "custom"]).default("school"),
  isActive: z.boolean().default(true),
  defaultMaxMarks: z.coerce.number().min(1).max(1000).default(100),
  defaultPassingMarks: z.coerce.number().min(1).max(1000).default(40),
  institutionCode: z.string().optional(),
});

export const examTermSchema = z.object({
  name: z.string().min(2).max(80),
  academicYear: z.string().min(4).max(40),
  examTypeId: z.string().optional().nullable(),
  weightPercent: z.coerce.number().min(0).max(100).default(100),
  status: z.enum(["draft", "active", "closed"]).default("draft"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  institutionCode: z.string().optional(),
  remarks: z.string().optional(),
});

export const marksComponentSchema = z.object({
  key: z.string().trim().min(1).max(30),
  label: z.string().trim().min(1).max(40),
  maxMarks: z.coerce.number().min(1).max(1000),
});

export const examScheduleRowSchema = z.object({
  subjectId: z.string().min(1),
  examDate: z.string().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  totalMarks: z.coerce.number().min(1).max(1000).default(100),
  passingMarks: z.coerce.number().min(1).max(1000).default(40),
  room: z.string().optional(),
  invigilatorId: z.string().optional().nullable(),
  instructions: z.string().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  components: z.array(marksComponentSchema).max(10).default([]),
});

export const examScheduleSchema = z.object({
  academicYear: z.string().min(4).max(40),
  termId: z.string().min(1),
  examTypeId: z.string().optional().nullable(),
  classId: z.string().min(1),
  status: z.enum(["draft", "published"]).default("draft"),
  rows: z.array(examScheduleRowSchema).default([]),
  institutionCode: z.string().optional(),
});

export type ExamTypeInput = z.infer<typeof examTypeSchema>;
export type ExamTermInput = z.infer<typeof examTermSchema>;
export type ExamScheduleInput = z.infer<typeof examScheduleSchema>;

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm time");

/** Bulk date-sheet planner: subjects of each class spread over working days. */
export const dateSheetPlanSchema = z.object({
  termId: objectId,
  classIds: z.array(objectId).min(1, "Select at least one class"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  startTime: hhmm,
  endTime: hhmm,
  /** 0 = Sunday … 6 = Saturday */
  offDays: z.array(z.coerce.number().int().min(0).max(6)).default([0]),
  holidays: z.array(z.string()).default([]),
  /** Free days left between two papers (0 = paper every working day). */
  gapDays: z.coerce.number().int().min(0).max(5).default(0),
  components: z.array(marksComponentSchema).min(1).max(10),
  passPercent: z.coerce.number().min(1).max(100).default(40),
});

export const dateSheetSaveSchema = z.object({
  termId: objectId,
  status: z.enum(["draft", "published"]).default("published"),
  schedules: z
    .array(
      z.object({
        classId: objectId,
        rows: z.array(examScheduleRowSchema).min(1, "A date sheet needs at least one paper"),
      })
    )
    .min(1),
});

export const rollNumberSchema = z.object({
  termId: objectId,
  classIds: z.array(objectId).min(1, "Select at least one class"),
  /** "class" = use each student's class roll number; "sequence" = running number across classes. */
  mode: z.enum(["class", "sequence"]).default("sequence"),
  startFrom: z.coerce.number().int().min(1).max(9999999).default(1001),
  prefix: z.string().trim().max(10).default(""),
  overwrite: z.boolean().default(false),
});

export const marksSaveSchema = z.object({
  termId: objectId,
  classId: objectId,
  subjectId: objectId,
  entries: z
    .array(
      z.object({
        studentId: objectId,
        marks: z.record(z.string(), z.coerce.number().min(0)).default({}),
        absent: z.boolean().default(false),
        remarks: z.string().max(200).optional(),
      })
    )
    .min(1),
  /** Why marks were changed — required once the term's results are final. */
  reason: z.string().trim().max(300).optional(),
});

/** One student's marks in every paper of the term (result preparation by student). */
export const studentMarksSaveSchema = z.object({
  termId: objectId,
  classId: objectId,
  studentId: objectId,
  subjects: z
    .array(
      z.object({
        subjectId: objectId,
        marks: z.record(z.string(), z.coerce.number().min(0)).default({}),
        absent: z.boolean().default(false),
        remarks: z.string().max(200).optional(),
      })
    )
    .min(1),
  /** Why marks were changed — required once the term's results are final. */
  reason: z.string().trim().max(300).optional(),
});

export type DateSheetPlanInput = z.infer<typeof dateSheetPlanSchema>;
export type StudentMarksSaveInput = z.infer<typeof studentMarksSaveSchema>;
export type DateSheetSaveInput = z.infer<typeof dateSheetSaveSchema>;
export type RollNumberInput = z.infer<typeof rollNumberSchema>;
export type MarksSaveInput = z.infer<typeof marksSaveSchema>;
