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
type PortalSession = { role: string; id: string; email: string };

async function canAccessClass(session: PortalSession, classId: string) {
  if (session.role === "admin") return true;
  if (session.role !== "teacher") return false;
  const teacher = await resolveTeacher(session as never);
  if (!teacher) return false;
  if ((teacher.classes || []).some((id: unknown) => String(id) === classId)) return true;
  return Boolean(await ClassModel.exists({ _id: classId, classTeacher: teacher._id }));
}

function classIdOf(value: unknown) {
  if (value && typeof value === "object" && "_id" in value) {
    return String((value as { _id: unknown })._id);
  }
  return String(value ?? "");
}

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
          const unique = new Map(
            lists.flat().map((student) => [String(student._id), student] as const)
          );
          return jsonOk({ students: [...unique.values()] });
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
      if (session!.role === "teacher" && !(await canAccessClass(session!, classIdOf(student.classId)))) {
        return jsonError("You are not assigned to this student's class", 403);
      }
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
      // Promotions affect every student in a class and are reserved for admins.
      if (body.kind === "promote" || body.kind === "promote-all") {
        if (session!.role !== "admin") return jsonError("Only an administrator can promote students", 403);
        if (body.kind === "promote") {
          const parsed = promoteSchema.safeParse(body);
          if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
          return jsonOk(await studentService.promotePassed(parsed.data), 201);
        }
        const parsed = promoteAllSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(await studentService.promoteAll(parsed.data), 201);
      }
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (!(await canAccessClass(session!, parsed.data.classId))) {
        return jsonError("You are not assigned to this class", 403);
      }
      const student = await studentService.create(parsed.data);
      return jsonOk({ student }, 201);
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
      if (body.kind === "issue-tc") {
        if (session!.role !== "admin") return jsonError("Only an administrator can issue a transfer certificate", 403);
        const parsed = issueTcSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ student: await studentService.issueTc(id, parsed.data) });
      }
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));

      if (session!.role === "teacher") {
        const existing = await studentService.getById(id);
        if (!(await canAccessClass(session!, classIdOf(existing.classId)))) {
          return jsonError("You are not assigned to this student's current class", 403);
        }
        if (!(await canAccessClass(session!, parsed.data.classId))) {
          return jsonError("You are not assigned to the target class", 403);
        }
      }
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
