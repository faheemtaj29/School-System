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
  generateMonthSchema,
} from "@/backend/validators/fee.validator";

type Ctx = { params: Promise<{ id: string }> };
const ID = /^[a-f0-9]{24}$/i;

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
      const parsed = feeStructureSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await feeBillingService.saveStructure(parsed.data));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async generateMonth(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const parsed = generateMonthSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await feeBillingService.generateMonth(parsed.data.month, parsed.data.classIds), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async collect(req: Request, ctx: Ctx) {
    const { error, session } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if (!ID.test(id)) return jsonError("Invalid voucher");
      const parsed = collectFeeSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await feeBillingService.collect(id, parsed.data, session || undefined));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async challans(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const q = new URL(req.url).searchParams;
      const ids = (q.get("ids") || "").split(",").filter((s) => ID.test(s));
      const classId = q.get("classId") || "";
      return jsonOk(
        await feeBillingService.challans({
          month: q.get("month") || undefined,
          classId: ID.test(classId) ? classId : undefined,
          status: q.get("status") || undefined,
          ids,
        })
      );
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async receipt(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if (!ID.test(id)) return jsonError("Invalid voucher");
      return jsonOk(await feeBillingService.receipt(id, new URL(req.url).searchParams.get("receiptNo")));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
