import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { feeBillingService } from "@/backend/services/feeBilling.service";
import {
  collectFeeSchema,
  feeStructureSchema,
} from "@/backend/validators/fee.validator";
import { z } from "zod";

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format"),
  classIds: z.array(z.string().min(1)).optional(),
});

export const feeBillingController = {
  async structure() {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      return jsonOk(await feeBillingService.structure());
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveStructure(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = feeStructureSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await feeBillingService.saveStructure(parsed.data));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async generateMonth(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = monthSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await feeBillingService.generateMonth(parsed.data.month, parsed.data.classIds));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async challans(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
      return jsonOk(await feeBillingService.challans({
        month: url.searchParams.get("month") || undefined,
        classId: url.searchParams.get("classId") || undefined,
        status: url.searchParams.get("status") || undefined,
        ids,
      }));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async collect(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const parsed = collectFeeSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const { id } = await ctx.params;
      return jsonOk(await feeBillingService.collect(id, parsed.data, session!), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async receipt(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const receiptNo = new URL(req.url).searchParams.get("receiptNo");
      return jsonOk(await feeBillingService.receipt(id, receiptNo));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
