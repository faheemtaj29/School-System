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
import { teacherService } from "@/backend/services/teacher.service";
import { classSchema, curriculumImportSchema } from "@/backend/validators/class.validator";

type Ctx = { params: Promise<{ id: string }> };

export const classController = {
  async list(req: Request) {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      if (new URL(req.url).searchParams.get("view") === "curriculum") {
        return jsonOk({ curriculum: classService.catalog() });
      }
      const classes = session!.role === "teacher"
        ? await teacherService.assignedClasses(session!)
        : await classService.list();
      return jsonOk({ classes });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_: Request, ctx: Ctx) {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const classData = await classService.getById(id);
      if (session!.role === "teacher") {
        await teacherService.assertClassAssigned(session!, id);
        const assignedClass = (await teacherService.assignedClasses(session!))
          .find((item) => String(item._id) === id);
        const assignedSubjectIds = new Set(
          (assignedClass?.subjects || []).map((subject: { _id: unknown }) => String(subject._id))
        );
        return jsonOk({
          class: {
            ...classData,
            subjects: (classData.subjects || []).filter((subject: { _id: unknown }) =>
              assignedSubjectIds.has(String(subject._id))
            ),
          },
        });
      }
      return jsonOk({ class: classData });
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
