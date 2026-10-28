import { z } from "zod";

const markComponentsSchema = z
  .object({
    theory: z.coerce.number().min(0).optional(),
    viva: z.coerce.number().min(0).optional(),
    assignment: z.coerce.number().min(0).optional(),
    attendance: z.coerce.number().min(0).optional(),
    project: z.coerce.number().min(0).optional(),
  })
  .optional();

export const examSchema = z.object({
  title: z.string().min(1),
  examType: z.enum(["quiz", "midterm", "final", "assignment"]),
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  date: z.string().min(1),
  maxMarks: z.coerce.number().min(1),
  teacherId: z.string().optional().nullable(),
  markComponents: markComponentsSchema,
  results: z
    .array(
      z.object({
        studentId: z.string().min(1),
        marks: z.coerce.number().min(0),
        components: markComponentsSchema,
        grade: z.string().optional(),
        remarks: z.string().optional(),
      })
    )
    .default([]),
});

/** Schema for bulk marksheet save: one entry per subject per class. */
export const marksheetSchema = z.object({
  classId: z.string().min(1),
  scheduleId: z.string().optional(),
  academicYear: z.string().min(1),
  termLabel: z.string().optional(),
  examType: z.enum(["quiz", "midterm", "final", "assignment"]).default("final"),
  date: z.string().min(1),
  /** Map of subjectId → { maxMarks, markComponents, students: [{ studentId, components }] } */
  subjects: z.array(
    z.object({
      subjectId: z.string().min(1),
      maxMarks: z.coerce.number().min(1).default(100),
      markComponents: z
        .object({
          theory: z.coerce.number().min(0).optional(),
          viva: z.coerce.number().min(0).optional(),
          assignment: z.coerce.number().min(0).optional(),
          attendance: z.coerce.number().min(0).optional(),
          project: z.coerce.number().min(0).optional(),
        })
        .optional(),
      students: z.array(
        z.object({
          studentId: z.string().min(1),
          components: z.object({
            theory: z.coerce.number().min(0).default(0),
            viva: z.coerce.number().min(0).default(0),
            assignment: z.coerce.number().min(0).default(0),
            attendance: z.coerce.number().min(0).default(0),
            project: z.coerce.number().min(0).default(0),
          }),
        })
      ),
    })
  ),
});

export type ExamInput = z.infer<typeof examSchema>;
export type MarksheetInput = z.infer<typeof marksheetSchema>;
