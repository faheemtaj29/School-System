import { z } from "zod";

export const feeLineSchema = z.object({
  head: z.string().min(1, "Fee head is required"),
  amount: z.coerce.number().min(0),
});

export const feeSchema = z.object({
  studentId: z.string().min(1),
  /** Optional summary title — derived from heads when omitted. */
  title: z.string().optional().or(z.literal("")),
  lines: z.array(feeLineSchema).min(1, "Add at least one fee head"),
  dueDate: z.string().min(1),
  status: z.enum(["pending", "paid", "overdue", "partial"]).default("pending"),
  paidAmount: z.coerce.number().min(0).default(0),
  paymentDate: z.string().optional().nullable(),
  method: z.enum(["cash", "card", "bank", "online"]).optional(),
  notes: z.string().optional(),
  branchCode: z.string().optional(),
});

/** Bulk challan — multiple fee heads billed to every student of a class. */
export const bulkFeeSchema = z.object({
  classId: z.string().optional().nullable(),
  lines: z.array(feeLineSchema).min(1, "Add at least one fee head"),
  title: z.string().optional().or(z.literal("")),
  dueDate: z.string().min(1),
  branchCode: z.string().optional(),
});

/** Split a fee into equal monthly installments. */
export const installmentFeeSchema = z.object({
  studentId: z.string().min(1),
  lines: z.array(feeLineSchema).min(1),
  title: z.string().optional().or(z.literal("")),
  firstDueDate: z.string().min(1),
  installments: z.coerce.number().int().min(2).max(12),
  branchCode: z.string().optional(),
});

export type FeeInput = z.infer<typeof feeSchema>;
export type BulkFeeInput = z.infer<typeof bulkFeeSchema>;
export type InstallmentFeeInput = z.infer<typeof installmentFeeSchema>;
