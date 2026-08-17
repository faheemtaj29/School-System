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
import { examSchema, examWorkflowSchema } from "@/backend/validators/exam.validator";

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
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = examSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ exam: await examService.create(parsed.data, session!) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      if (body?.kind === "workflow") {
        const flow = examWorkflowSchema.safeParse(body);
        if (!flow.success) return jsonError(firstZodError(flow.error.issues));
        return jsonOk({ exam: await examService.applyWorkflow(id, flow.data, session!) });
      }
      const parsed = examSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ exam: await examService.update(id, parsed.data, session!) });
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
