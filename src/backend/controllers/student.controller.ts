/**
 * Student HTTP handlers — CRUD plus class promotion of passed students.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { studentService } from "@/backend/services/student.service";
import {
  promoteSchema,
  studentEnrollmentSchema,
  studentSchema,
} from "@/backend/validators/student.validator";

type Ctx = { params: Promise<{ id: string }> };

export const studentController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const students = await studentService.list(
        url.searchParams.get("classId"),
        url.searchParams.get("branch")
      );
      return jsonOk({ students });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const student = await studentService.getById(id);
      return jsonOk({ student });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      if (body.kind === "promote") {
        const parsed = promoteSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(await studentService.promotePassed(parsed.data, session!), 201);
      }
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const student = await studentService.create(parsed.data);
      return jsonOk({ student }, 201);
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
      if (body.kind === "enrollment") {
        const parsedEnrollment = studentEnrollmentSchema.safeParse(body);
        if (!parsedEnrollment.success) return jsonError(firstZodError(parsedEnrollment.error.issues));
        const student = await studentService.addEnrollmentRecord(id, parsedEnrollment.data);
        return jsonOk({ student });
      }
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const student = await studentService.update(id, parsed.data);
      return jsonOk({ student });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const result = await studentService.remove(id);
      return jsonOk(result);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
