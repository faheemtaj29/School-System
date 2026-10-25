/**
 * Attendance HTTP handlers with class-level teacher authorization.
 */
import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { attendanceService } from "@/backend/services/attendance.service";
import { attendanceSchema } from "@/backend/validators/attendance.validator";
import { resolveTeacher } from "@/backend/lib/portal";
import { ClassModel } from "@/backend/models/Class";

async function canAccessClass(session: { role: string; id: string; email: string }, classId: string) {
  if (session.role === "admin") return true;
  if (session.role !== "teacher") return false;
  const teacher = await resolveTeacher(session as never);
  if (!teacher) return false;
  const assigned = (teacher.classes || []).some((id: unknown) => String(id) === classId);
  if (assigned) return true;
  const classTeacher = await ClassModel.exists({ _id: classId, classTeacher: teacher._id });
  return Boolean(classTeacher);
}

export const attendanceController = {
  async list(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const { searchParams } = new URL(req.url);
      const classId = searchParams.get("classId");
      if (session!.role === "teacher") {
        if (classId && !(await canAccessClass(session!, classId))) {
          return jsonError("You are not assigned to this class", 403);
        }
        if (!classId) {
          const teacher = await resolveTeacher(session!);
          if (!teacher) return jsonOk({ attendance: [] });
          const assignedIds = (teacher.classes || []).map((id: unknown) => String(id));
          const leadClasses = await ClassModel.find({ classTeacher: teacher._id }).distinct("_id");
          const allowedIds = [...new Set([...assignedIds, ...leadClasses.map(String)])];
          const sheets = await attendanceService.list({ date: searchParams.get("date") });
          return jsonOk({ attendance: sheets.filter((sheet: { classId?: unknown }) => allowedIds.includes(String((sheet.classId as { _id?: unknown })?._id ?? sheet.classId))) });
        }
      }
      const attendance = await attendanceService.list({ classId, date: searchParams.get("date") });
      return jsonOk({ attendance });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async save(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = attendanceSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (!(await canAccessClass(session!, parsed.data.classId))) {
        return jsonError("You are not assigned to this class", 403);
      }
      const attendance = await attendanceService.upsert(parsed.data, session!.id);
      return jsonOk({ attendance }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
