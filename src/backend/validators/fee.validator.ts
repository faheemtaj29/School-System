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
  billingMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Billing month must use YYYY-MM format").optional(),
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


export const collectFeeSchema = z.object({
  amount: z.coerce.number().positive("Payment amount must be greater than zero"),
  date: z.string().optional(),
  method: z.enum(["cash", "card", "bank", "online"]),
  note: z.string().max(500).optional(),
});

export const feeStructureSchema = z.object({
  classes: z.array(z.object({
    classId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid class ID"),
    lines: z.array(feeLineSchema),
  })),
  autoMonthlyFees: z.boolean().optional(),
  feeGenerateDay: z.coerce.number().int().min(1).max(28).optional(),
  feeDueDay: z.coerce.number().int().min(1).max(28).optional(),
});

export type CollectFeeInput = z.infer<typeof collectFeeSchema>;
export type FeeStructureInput = z.infer<typeof feeStructureSchema>;
