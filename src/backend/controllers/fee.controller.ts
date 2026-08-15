/**
 * Fee HTTP handlers — students only see their own vouchers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { feeService } from "@/backend/services/fee.service";
import { resolveStudent } from "@/backend/lib/portal";
import { feeSchema } from "@/backend/validators/fee.validator";

type Ctx = { params: Promise<{ id: string }> };

export const feeController = {
  async list(req: Request) {
    const { session, error } = await requireAuth(["admin", "staff", "student", "parent"]);
    if (error) return error;
    try {
      const { searchParams } = new URL(req.url);
      let studentId = searchParams.get("studentId");
      if (session!.role === "student" || session!.role === "parent") {
        const student = await resolveStudent(session!);
        if (!student) return jsonOk({ fees: [], portal: "student", linked: false });
        studentId = String(student._id);
      }
      const fees = await feeService.list({
        studentId,
        status: searchParams.get("status"),
      });
      return jsonOk({ fees });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = feeSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ fee: await feeService.create(parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = feeSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ fee: await feeService.update(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await feeService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
