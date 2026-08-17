import { z } from "zod";

export const examSchema = z.object({
  title: z.string().min(1),
  examType: z.enum(["quiz", "midterm", "final", "assignment"]),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  date: z.string().min(1),
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

export type ExamInput = z.infer<typeof examSchema>;
