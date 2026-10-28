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
import { teacherService } from "@/backend/services/teacher.service";
import { subjectSchema } from "@/backend/validators/subject.validator";

type Ctx = { params: Promise<{ id: string }> };

export const subjectController = {
  async list() {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      const subjects = session!.role === "teacher"
        ? await subjectService.list(
            [...new Set(
              (await teacherService.assignedClasses(session!)).flatMap((item) =>
                (item.subjects || []).map((subject: { _id: unknown }) => String(subject._id))
              )
            )]
          )
        : await subjectService.list();
      return jsonOk({ subjects });
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
