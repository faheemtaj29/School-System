/**
 * Subject HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { subjectService } from "@/backend/services/subject.service";
import { subjectSchema } from "@/backend/validators/subject.validator";

type Ctx = { params: Promise<{ id: string }> };

export const subjectController = {
  async list() {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk({ subjects: await subjectService.list() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = subjectSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ subject: await subjectService.create(parsed.data) }, 201);
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
      const parsed = subjectSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ subject: await subjectService.update(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** POST /api/subjects/[id]  { action: "teachers", teacherIds } | { action: "merge", into } */
  async action(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      if (body.action === "teachers" && Array.isArray(body.teacherIds)) {
        return jsonOk(await subjectService.setTeachers(id, body.teacherIds.map(String)));
      }
      if (body.action === "merge" && typeof body.into === "string") {
        return jsonOk(await subjectService.merge(id, body.into));
      }
      return jsonError("Unknown action");
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await subjectService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
