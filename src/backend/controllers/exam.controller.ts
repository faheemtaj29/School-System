/** Exam HTTP handlers with assignment-based teacher authorization. */
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { examService } from "@/backend/services/exam.service";
import { examSchema, marksheetSchema } from "@/backend/validators/exam.validator";
import { resolveTeacher } from "@/backend/lib/portal";
import { ClassModel } from "@/backend/models/Class";
import { Exam } from "@/backend/models/Exam";
import { Student } from "@/backend/models/Student";

type Ctx = { params: Promise<{ id: string }> };
type Session = { role: string; id: string; email: string };

async function canAccessClass(session: Session, classId: string) {
  if (session.role === "admin") return true;
  if (session.role !== "teacher") return false;
  const teacher = await resolveTeacher(session as never);
  if (!teacher) return false;
  if ((teacher.classes || []).some((id: unknown) => String(id) === classId)) return true;
  return Boolean(await ClassModel.exists({ _id: classId, classTeacher: teacher._id }));
}

async function canAccessSubject(session: Session, classId: string, subjectId: string) {
  if (session.role === "admin") return true;
  if (session.role !== "teacher" || !(await canAccessClass(session, classId))) return false;
  const teacher = await resolveTeacher(session as never);
  if (!teacher) return false;
  const cls = await ClassModel.findById(classId).select("classTeacher subjects").lean();
  if (!cls || !(cls.subjects || []).some((id: unknown) => String(id) === subjectId)) return false;
  const isClassTeacher = String(cls.classTeacher || "") === String(teacher._id);
  return isClassTeacher || (teacher.subjects || []).some((id: unknown) => String(id) === subjectId);
}

async function validateExamAccess(session: Session, data: { classId: string; subjectId: string; teacherId?: string | null; results?: { studentId: string }[] }) {
  if (!(await canAccessSubject(session, data.classId, data.subjectId))) return false;
  if (session.role === "teacher") {
    const teacher = await resolveTeacher(session as never);
    if (!teacher || (data.teacherId && String(data.teacherId) !== String(teacher._id))) return false;
  }
  const ids = [...new Set((data.results || []).map((r) => r.studentId))];
  if (ids.length !== (data.results || []).length) return false;
  if (ids.length && await Student.countDocuments({ _id: { $in: ids }, classId: data.classId }) !== ids.length) return false;
  return true;
}

export const examController = {
  async list() {
    const { session, error } = await requireAuth(["admin", "teacher", "staff"]);
    if (error) return error;
    try {
      const exams = await examService.list();
      if (session!.role !== "teacher") return jsonOk({ exams });
      const visible = [];
      for (const exam of exams as Array<{ classId: { _id?: unknown } | unknown; subjectId: { _id?: unknown } | unknown }>) {
        const classId = String((exam.classId as { _id?: unknown })?._id ?? exam.classId);
        const subjectId = String((exam.subjectId as { _id?: unknown })?._id ?? exam.subjectId);
        if (await canAccessSubject(session!, classId, subjectId)) visible.push(exam);
      }
      return jsonOk({ exams: visible });
    } catch (e) { return fromServiceError(e); }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const parsed = examSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (!(await validateExamAccess(session!, parsed.data))) return jsonError("You are not authorized for this class and subject", 403);
      const teacher = session!.role === "teacher" ? await resolveTeacher(session!) : null;
      return jsonOk({ exam: await examService.create({ ...parsed.data, teacherId: teacher ? String(teacher._id) : parsed.data.teacherId }) }, 201);
    } catch (e) { return fromServiceError(e); }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = examSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (session!.role === "teacher") {
        const existing = await Exam.findById(id).lean();
        if (!existing) return jsonError("Exam not found", 404);
        if (!(await canAccessSubject(session!, String(existing.classId), String(existing.subjectId)))) return jsonError("You are not authorized to edit this exam", 403);
      }
      if (!(await validateExamAccess(session!, parsed.data))) return jsonError("You are not authorized for this class and subject", 403);
      const teacher = session!.role === "teacher" ? await resolveTeacher(session!) : null;
      return jsonOk({ exam: await examService.update(id, { ...parsed.data, teacherId: teacher ? String(teacher._id) : parsed.data.teacherId }) });
    } catch (e) { return fromServiceError(e); }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await examService.remove(id));
    } catch (e) { return fromServiceError(e); }
  },

  async getMarksheet(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const classId = new URL(req.url).searchParams.get("classId");
      if (!classId) return jsonError("classId is required");
      if (!(await canAccessClass(session!, classId))) return jsonError("You are not assigned to this class", 403);
      const sheet = await examService.getMarksheet(classId);
      if (session!.role === "teacher") {
        const teacher = await resolveTeacher(session!);
        const isClassTeacher = Boolean(teacher && await ClassModel.exists({ _id: classId, classTeacher: teacher._id }));
        const subjects = new Set((teacher?.subjects || []).map((id: unknown) => String(id)));
        const allowed = new Set((sheet.cls.subjects as unknown[]).filter((s: unknown) => {
          const id = String((s as { _id?: unknown })?._id ?? s);
          return isClassTeacher || subjects.has(id);
        }).map((s: unknown) => String((s as { _id?: unknown })?._id ?? s)));
        sheet.cls.subjects = (sheet.cls.subjects as unknown[]).filter((s: unknown) => allowed.has(String((s as { _id?: unknown })?._id ?? s))) as never;
        sheet.exams = (sheet.exams as unknown[]).filter((exam: unknown) => {
          const subject = (exam as { subjectId?: { _id?: unknown } | unknown }).subjectId;
          return allowed.has(String((subject as { _id?: unknown })?._id ?? subject));
        }) as never;
      }
      return jsonOk(sheet);
    } catch (e) { return fromServiceError(e); }
  },

  async saveMarksheet(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const parsed = marksheetSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      if (!(await canAccessClass(session!, parsed.data.classId))) return jsonError("You are not assigned to this class", 403);
      if (session!.role === "teacher") {
        const teacher = await resolveTeacher(session!);
        const isClassTeacher = Boolean(teacher && await ClassModel.exists({ _id: parsed.data.classId, classTeacher: teacher._id }));
        const assignedSubjects = new Set((teacher?.subjects || []).map((id: unknown) => String(id)));
        const cls = await ClassModel.findById(parsed.data.classId).select("subjects").lean();
        const classSubjects = new Set((cls?.subjects || []).map((id: unknown) => String(id)));
        for (const subject of parsed.data.subjects) {
          if (!classSubjects.has(subject.subjectId) || (!isClassTeacher && !assignedSubjects.has(subject.subjectId))) return jsonError("You are not authorized to enter marks for one or more subjects", 403);
          const ids = [...new Set(subject.students.map((s) => s.studentId))];
          if (ids.length !== subject.students.length) return jsonError("Duplicate student in marksheet", 400);
          const count = await Student.countDocuments({ _id: { $in: ids }, classId: parsed.data.classId });
          if (count !== ids.length) return jsonError("Marksheets may include only students in the selected class", 400);
          for (const student of subject.students) {
            const total = Object.values(student.components).reduce((sum, value) => sum + value, 0);
            if (total > subject.maxMarks) return jsonError("A student's total marks cannot exceed the subject maximum", 400);
          }
        }
      }
      return jsonOk(await examService.saveMarksheet(parsed.data));
    } catch (e) { return fromServiceError(e); }
  },
};
