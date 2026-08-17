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
import { examSchema } from "@/backend/validators/exam.validator";

type Ctx = { params: Promise<{ id: string }> };

export const examController = {
  async list() {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk({ exams: await examService.list() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin", "teacher"]);
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
    const { error } = await requireAuth(["admin", "teacher"]);
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
};
