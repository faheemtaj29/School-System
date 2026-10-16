import { z } from "zod";
import {
  ACTIVITY_TYPES,
  DEAL_STEPS,
  FINANCE_STATUSES,
  LEAD_SOURCES,
  LEAD_STAGES,
  VEHICLE_STATUSES,
  isValidVin,
} from "@/lib/dealership";

const money = z.coerce.number().min(0).default(0);
const optionalMoney = z.coerce.number().min(0).optional();
const currentYear = new Date().getFullYear();

export const vehicleSchema = z.object({
  stockNo: z.string().trim().optional(),
  vin: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || isValidVin(v), "VIN must be 17 characters (no I, O or Q)"),
  registrationNo: z.string().trim().optional(),
  make: z.string().trim().min(1, "Make is required"),
  model: z.string().trim().min(1, "Model is required"),
  variant: z.string().trim().optional(),
  year: z.coerce.number().int().min(1950).max(currentYear + 1),
  bodyType: z.string().optional(),
  fuel: z.string().optional(),
  transmission: z.string().optional(),
  color: z.string().optional(),
  engineCc: z.coerce.number().min(0).optional(),
  mileage: money,
  condition: z.enum(["new", "used", "certified"]).default("used"),
  status: z.enum(VEHICLE_STATUSES).default("in_stock"),
  branchCode: z.string().optional(),
  purchaseCost: money,
  listPrice: money,
  floorPrice: money,
  photos: z.array(z.string().trim().url("Photo must be a full URL")).max(20).default([]),
  features: z.array(z.string().trim().min(1)).max(60).default([]),
  acquiredFrom: z.string().optional(),
  acquiredAt: z.string().optional(),
  notes: z.string().optional(),
});

export const reconSchema = z.object({
  description: z.string().trim().min(2, "Describe the work done"),
  vendor: z.string().optional(),
  amount: z.coerce.number().positive("Amount must be more than zero"),
  date: z.string().optional(),
});

export const vehicleTransferSchema = z.object({
  toBranchCode: z.string().trim().min(1, "Select the destination branch"),
});

const tradeInSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.coerce.number().optional(),
  mileage: optionalMoney,
  registrationNo: z.string().optional(),
  condition: z.string().optional(),
  expectedValue: optionalMoney,
  offeredValue: optionalMoney,
  payoff: optionalMoney,
});

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Customer name is required"),
  phone: z.string().trim().optional(),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  cnic: z.string().trim().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  source: z.enum(LEAD_SOURCES).default("walk_in"),
  stage: z.enum(LEAD_STAGES).default("new"),
  lostReason: z.string().optional(),
  branchCode: z.string().optional(),
  assignedTo: z.string().optional(),
  interestedVehicleId: z.string().optional().or(z.literal("")),
  interestNotes: z.string().optional(),
  budgetMin: optionalMoney,
  budgetMax: optionalMoney,
  wantsFinancing: z.boolean().default(false),
  tradeIn: tradeInSchema.optional(),
  nextFollowUp: z.string().optional().or(z.literal("")),
});

export const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).default("note"),
  text: z.string().trim().min(1, "Activity text is required"),
  nextFollowUp: z.string().optional().or(z.literal("")),
  stage: z.enum(LEAD_STAGES).optional(),
});

const financingSchema = z.object({
  status: z.enum(FINANCE_STATUSES).default("none"),
  lender: z.string().optional(),
  downPayment: money,
  amount: money,
  annualRate: z.coerce.number().min(0).max(80).default(0),
  tenureMonths: z.coerce.number().int().min(0).max(120).default(0),
  reference: z.string().optional(),
});

export const dealSchema = z.object({
  customerId: z.string().min(1, "Select a customer"),
  vehicleId: z.string().min(1, "Select a vehicle"),
  salesperson: z.string().optional(),
  salePrice: z.coerce.number().positive("Sale price is required"),
  discount: money,
  tradeInAllowance: money,
  tradeInPayoff: money,
  includeTradeIn: z.boolean().default(false),
  taxAmount: money,
  registrationFee: money,
  otherFees: money,
  commissionRate: z.coerce.number().min(0).max(100).default(0),
  financing: financingSchema.optional(),
  notes: z.string().optional(),
  reserve: z.boolean().default(false),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Payment must be more than zero"),
  method: z.enum(["cash", "bank", "online", "cheque"]).default("cash"),
  reference: z.string().optional(),
  note: z.string().optional(),
  date: z.string().optional(),
});

const stepKeys = DEAL_STEPS.map((s) => s.key) as [string, ...string[]];

export const dealActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reserve") }),
  z.object({ action: z.literal("payment"), payment: paymentSchema }),
  z.object({ action: z.literal("remove_payment"), paymentId: z.string().min(1) }),
  z.object({ action: z.literal("financing"), financing: financingSchema }),
  z.object({ action: z.literal("step"), step: z.enum(stepKeys), done: z.boolean() }),
  z.object({ action: z.literal("deliver") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3, "Give a reason") }),
]);
