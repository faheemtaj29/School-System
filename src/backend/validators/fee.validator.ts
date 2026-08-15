import { z } from "zod";

export const feeSchema = z.object({
  studentId: z.string().min(1),
  title: z.string().min(1),
  amount: z.coerce.number().min(0),
  dueDate: z.string().min(1),
  status: z.enum(["pending", "paid", "overdue", "partial"]).default("pending"),
  paidAmount: z.coerce.number().min(0).default(0),
  paymentDate: z.string().optional().nullable(),
  method: z.enum(["cash", "card", "bank", "online"]).optional(),
  notes: z.string().optional(),
  branchCode: z.string().optional(),
});

export type FeeInput = z.infer<typeof feeSchema>;
