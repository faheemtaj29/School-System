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
import { resolveTeacher } from "@/backend/lib/portal";
import { ClassModel } from "@/backend/models/Class";
import { issueTcSchema, promoteAllSchema, promoteSchema, studentSchema } from "@/backend/validators/student.validator";

type Ctx = { params: Promise<{ id: string }> };

export const studentController = {
  async list(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const requestedClass = url.searchParams.get("classId");
      if (session!.role === "teacher") {
        const teacher = await resolveTeacher(session!);
        if (!teacher) return jsonOk({ students: [] });
        const assigned = (teacher.classes || []).map((id: unknown) => String(id));
        const lead = await ClassModel.find({ classTeacher: teacher._id }).distinct("_id");
        const allowed = [...new Set([...assigned, ...lead.map(String)])];
        if (requestedClass && !allowed.includes(requestedClass)) {
          return jsonError("You are not assigned to this class", 403);
        }
        if (!requestedClass) {
          const lists = await Promise.all(allowed.map((id) => studentService.list(id, url.searchParams.get("branch"))));
          return jsonOk({ students: lists.flat() });
        }
      }
      const students = await studentService.list(requestedClass, url.searchParams.get("branch"));
      return jsonOk({ students });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async get(_: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const student = await studentService.getById(id);
      if (session!.role === "teacher") {
        const teacher = await resolveTeacher(session!);
        if (!teacher) return jsonError("Teacher profile not linked", 403);
        const studentClassId = String((student as { classId?: { _id?: unknown } }).classId?._id ?? (student as { classId?: unknown }).classId ?? "");
        const assigned = (teacher.classes || []).some((classId: unknown) => String(classId) === studentClassId);
        const classTeacher = await ClassModel.exists({ _id: studentClassId, classTeacher: teacher._id });
        if (!assigned && !classTeacher) return jsonError("You are not assigned to this student's class", 403);
      }
      return jsonOk({ student });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      if (body.kind === "promote") {
        const parsed = promoteSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(await studentService.promotePassed(parsed.data), 201);
      }
      if (body.kind === "promote-all") {
        const parsed = promoteAllSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(await studentService.promoteAll(parsed.data), 201);
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
      if (body.kind === "issue-tc") {
        const parsed = issueTcSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ student: await studentService.issueTc(id, parsed.data) });
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
