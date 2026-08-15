/**
 * Class HTTP handlers.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { classService } from "@/backend/services/class.service";
import { classSchema, curriculumImportSchema } from "@/backend/validators/class.validator";

type Ctx = { params: Promise<{ id: string }> };

export const classController = {
  async list(req: Request) {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      if (new URL(req.url).searchParams.get("view") === "curriculum") {
        return jsonOk({ curriculum: classService.catalog() });
      }
      return jsonOk({ classes: await classService.list() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_: Request, ctx: Ctx) {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk({ class: await classService.getById(id) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      if (new URL(req.url).searchParams.get("kind") === "curriculum") {
        const parsed = curriculumImportSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ imported: await classService.importCurriculum(parsed.data) }, 201);
      }
      const parsed = classSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ class: await classService.create(parsed.data) }, 201);
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
      const parsed = classSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ class: await classService.update(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await classService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
