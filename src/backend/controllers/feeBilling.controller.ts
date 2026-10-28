import { verifyChallanToken } from "@/backend/lib/challanLink";
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
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { resolveChildren } from "@/backend/lib/portal";
import { Fee } from "@/backend/models/Fee";
import type { SessionUser } from "@/backend/types";

const monthSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Month must use YYYY-MM format"),
  classIds: z.array(z.string().regex(/^[a-f\d]{24}$/i, "Invalid class ID")).optional(),
});

/** True when every fee id belongs to one of this student/parent login's children. */
async function ownFees(session: SessionUser, ids: string[]) {
  if (!ids.every((id) => isValidObjectId(id))) return false;
  await dbConnect();
  const kids = new Set((await resolveChildren(session)).map((k) => String(k._id)));
  const fees = await Fee.find({ _id: { $in: ids } }).select("studentId").lean();
  return fees.length === ids.length && fees.every((f) => kids.has(String(f.studentId)));
}

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
    const { session, error } = await requireAuth(["admin", "staff", "student", "parent"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
      // Parents/students may print only their own children's challans, by id.
      if (session!.role === "student" || session!.role === "parent") {
        if (!ids?.length || !(await ownFees(session!, ids))) return jsonError("Forbidden", 403);
      }
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

  /** GET /api/public/challan?t=<token> — one challan from a signed WhatsApp/SMS link, no login. */
  async publicChallan(req: Request) {
    try {
      const feeId = verifyChallanToken(new URL(req.url).searchParams.get("t") || "");
      if (!feeId) return jsonError("This challan link is not valid", 404);
      return jsonOk(await feeBillingService.challans({ ids: [feeId] }));
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

  async syncLedger(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await feeBillingService.syncLedger(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async receipt(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const { session, error } = await requireAuth(["admin", "staff", "student", "parent"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if ((session!.role === "student" || session!.role === "parent") && !(await ownFees(session!, [id]))) {
        return jsonError("Forbidden", 403);
      }
      const receiptNo = new URL(req.url).searchParams.get("receiptNo");
      return jsonOk(await feeBillingService.receipt(id, receiptNo));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
