import { z } from "zod";

export const subjectSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  description: z.string().optional(),
  credits: z.coerce.number().min(0).default(1),
  stage: z.string().optional(),
});

export type SubjectInput = z.infer<typeof subjectSchema>;
