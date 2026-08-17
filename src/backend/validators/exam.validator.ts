import { z } from "zod";

export const examSchema = z.object({
  title: z.string().min(1),
  examType: z.string().trim().min(1, "Term/Type is required"),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  date: z.string().min(1),
  endDate: z.string().optional().nullable(),
  examTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  room: z.string().trim().min(1, "Room is required").optional().nullable(),
  maxMarks: z.coerce.number().min(1),
  teacherId: z.string().optional().nullable(),
  results: z
    .array(
      z.object({
        studentId: z.string().min(1),
        marks: z.coerce.number().min(0),
        grade: z.string().optional(),
        remarks: z.string().optional(),
      })
    )
    .default([]),
});

export const examWorkflowSchema = z.object({
  kind: z.literal("workflow"),
  action: z.enum(["submit", "verify", "approve", "lock", "publish", "unlock"]),
  note: z.string().optional(),
});

export type ExamInput = z.infer<typeof examSchema>;
export type ExamWorkflowInput = z.infer<typeof examWorkflowSchema>;
