/**
 * Teacher HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { teacherService } from "@/backend/services/teacher.service";
import { teacherSchema } from "@/backend/validators/teacher.validator";

type Ctx = { params: Promise<{ id: string }> };

export const teacherController = {
  async list(req: Request) {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      const teachers = session!.role === "teacher"
        ? [await teacherService.getById(String((await teacherService.forSession(session!))._id))]
        : await teacherService.list(new URL(req.url).searchParams.get("branch"));
      return jsonOk({ teachers });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_: Request, ctx: Ctx) {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if (session!.role === "teacher" && id !== String((await teacherService.forSession(session!))._id)) {
        return jsonError("You may only view your own teacher profile", 403);
      }
      const teacher = await teacherService.getById(id);
      return jsonOk({ teacher });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = teacherSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const teacher = await teacherService.create(parsed.data);
      return jsonOk({ teacher }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = teacherSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const teacher = await teacherService.update(id, parsed.data);
      return jsonOk({ teacher });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await teacherService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
