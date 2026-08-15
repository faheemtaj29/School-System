import { z } from "zod";

export const stageEnum = z.enum([
  "pre-primary",
  "primary",
  "middle",
  "secondary",
  "intermediate",
  "undergraduate",
  "postgraduate",
]);

export const classSchema = z.object({
  name: z.string().min(1),
  section: z.string().min(1),
  academicYear: z.string().min(4),
  room: z.string().optional(),
  classTeacher: z.string().optional().nullable(),
  capacity: z.coerce.number().min(1).default(40),
  branchCode: z.string().optional(),
  stage: stageEnum.optional(),
  stream: z.string().optional(),
  level: z.coerce.number().optional(),
  subjects: z.array(z.string()).default([]),
});

/** Import selected stages of the default curriculum. */
export const curriculumImportSchema = z.object({
  stages: z.array(stageEnum).min(1, "Pick at least one stage"),
  academicYear: z.string().min(4).default(new Date().getFullYear().toString()),
  sections: z.array(z.string().min(1)).default(["A"]),
  branchCode: z.string().optional(),
});

export type ClassInput = z.infer<typeof classSchema>;
export type CurriculumImportInput = z.infer<typeof curriculumImportSchema>;
