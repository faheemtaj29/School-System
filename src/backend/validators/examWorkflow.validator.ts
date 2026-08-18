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
