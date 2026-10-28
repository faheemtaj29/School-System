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
import { teacherService } from "@/backend/services/teacher.service";
import {
  issueTcSchema,
  promoteAllSchema,
  promoteSchema,
  studentPhotoSchema,
  studentSchema,
} from "@/backend/validators/student.validator";

type Ctx = { params: Promise<{ id: string }> };

export const studentController = {
  async list(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const requestedClassId = url.searchParams.get("classId");
      const classIds = session!.role === "teacher"
        ? (await teacherService.assignedClasses(session!)).map((item) => String(item._id))
        : null;
      if (session!.role === "teacher" && requestedClassId && !classIds!.includes(requestedClassId)) {
        return jsonError("This class is not assigned to your teacher account", 403);
      }
      const students = await studentService.list(
        session!.role === "teacher" ? requestedClassId || classIds! : requestedClassId,
        url.searchParams.get("branch"),
        url.searchParams.get("activeOnly") === "true"
      );
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
        const classId = typeof student.classId === "object" && student.classId
          ? String((student.classId as { _id: unknown })._id)
          : String(student.classId);
        await teacherService.assertClassAssigned(session!, classId);
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
      if (body.kind === "promote") {
        const parsed = promoteSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        if (session!.role === "teacher") {
          await teacherService.assertClassAssigned(session!, parsed.data.classId);
        }
        return jsonOk(await studentService.promotePassed(parsed.data), 201);
      }
      if (body.kind === "promote-all") {
        const parsed = promoteAllSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        if (session!.role === "teacher") {
          await teacherService.assertClassAssigned(session!, parsed.data.fromClassId);
        }
        return jsonOk(await studentService.promoteAll(parsed.data), 201);
      }
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (session!.role === "teacher") {
        await teacherService.assertClassAssigned(session!, parsed.data.classId);
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
      if (session!.role === "teacher") {
        const current = await studentService.getById(id);
        const currentClassId = typeof current.classId === "object" && current.classId
          ? String((current.classId as { _id: unknown })._id)
          : String(current.classId);
        await teacherService.assertClassAssigned(session!, currentClassId);
      }
      if (
        body &&
        typeof body === "object" &&
        Object.keys(body).length === 1 &&
        Object.hasOwn(body, "profilePhoto")
      ) {
        const parsedPhoto = studentPhotoSchema.safeParse(body);
        if (!parsedPhoto.success) {
          return jsonError(firstZodError(parsedPhoto.error.issues));
        }
        return jsonOk({
          student: await studentService.updateProfilePhoto(id, parsedPhoto.data.profilePhoto),
        });
      }
      if (body.kind === "issue-tc") {
        const parsed = issueTcSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ student: await studentService.issueTc(id, parsed.data) });
      }
      const parsed = studentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (session!.role === "teacher") {
        await teacherService.assertClassAssigned(session!, parsed.data.classId);
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
