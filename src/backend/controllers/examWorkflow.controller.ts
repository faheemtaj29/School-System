import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { examWorkflowService } from "@/backend/services/examWorkflow.service";
import {
  examScheduleSchema,
  examTermSchema,
  examTypeSchema,
} from "@/backend/validators/examWorkflow.validator";

type Ctx = { params: Promise<{ id: string }> };

export const examWorkflowController = {
  async listTypes(req: Request) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const institutionCode = new URL(req.url).searchParams.get("institutionCode");
      return jsonOk({ types: await examWorkflowService.listTypes(institutionCode) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async createType(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = examTypeSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ type: await examWorkflowService.createType(parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async updateType(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = examTypeSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ type: await examWorkflowService.updateType(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeType(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await examWorkflowService.removeType(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async listTerms(req: Request) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const params = new URL(req.url).searchParams;
      return jsonOk({
        terms: await examWorkflowService.listTerms({
          institutionCode: params.get("institutionCode"),
          academicYear: params.get("academicYear"),
        }),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async createTerm(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = examTermSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ term: await examWorkflowService.createTerm(parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async updateTerm(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = examTermSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ term: await examWorkflowService.updateTerm(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeTerm(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await examWorkflowService.removeTerm(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async listSchedules(req: Request) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const params = new URL(req.url).searchParams;
      if (params.get("view") === "subjects") {
        const classId = params.get("classId");
        if (!classId) return jsonError("classId is required", 400);
        return jsonOk(await examWorkflowService.classSubjects(classId));
      }
      return jsonOk({
        schedules: await examWorkflowService.listSchedules({
          institutionCode: params.get("institutionCode"),
          academicYear: params.get("academicYear"),
          termId: params.get("termId"),
          classId: params.get("classId"),
        }),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async createSchedule(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const parsed = examScheduleSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(
        { schedule: await examWorkflowService.createSchedule(parsed.data, session!.id) },
        201
      );
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async updateSchedule(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = examScheduleSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ schedule: await examWorkflowService.updateSchedule(id, parsed.data, session!.id) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeSchedule(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await examWorkflowService.removeSchedule(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
