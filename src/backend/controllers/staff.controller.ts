/**
 * Staff HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { staffService } from "@/backend/services/staff.service";
import { staffSchema } from "@/backend/validators/auth.validator";

type Ctx = { params: Promise<{ id: string }> };

export const staffController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const branch = new URL(req.url).searchParams.get("branch");
      return jsonOk({ staff: await staffService.list(branch) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = staffSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ staff: await staffService.create(parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = staffSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ staff: await staffService.update(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await staffService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
