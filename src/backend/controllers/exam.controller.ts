/**
 * Exam HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { examService } from "@/backend/services/exam.service";
import { examSchema, marksheetSchema } from "@/backend/validators/exam.validator";

type Ctx = { params: Promise<{ id: string }> };

export const examController = {
  async list() {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk({ exams: await examService.list(session!) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = examSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ exam: await examService.create(parsed.data) }, 201);
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
      const parsed = examSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ exam: await examService.update(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await examService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async getMarksheet(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const params = new URL(req.url).searchParams;
      const classId = params.get("classId");
      if (!classId) return jsonError("classId is required");
      return jsonOk(await examService.getMarksheet(classId, {
        subjectId: params.get("subjectId"),
        scheduleId: params.get("scheduleId"),
        session: session!,
      }));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveMarksheet(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = marksheetSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await examService.saveMarksheet(parsed.data, session!));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
