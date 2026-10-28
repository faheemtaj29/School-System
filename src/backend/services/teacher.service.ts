/**
 * Teacher CRUD with related subjects + classes.
 */
import { dbConnect } from "@/backend/config/database";
import { Teacher } from "@/backend/models/Teacher";
import { ClassModel } from "@/backend/models/Class";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError, type SessionUser } from "@/backend/types";
import type { TeacherInput } from "@/backend/validators/teacher.validator";
import { numberingService } from "@/backend/services/numbering.service";

function toPayload(data: TeacherInput) {
  return {
    ...data,
    employeeId: data.employeeId || undefined,
    branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    dateOfBirth: parseOptionalDate(data.dateOfBirth),
    joinDate: parseOptionalDate(data.joinDate),
  };
}

async function populated(id: string) {
  return Teacher.findById(id)
    .populate("subjects", "name code")
    .populate("classes", "name section")
    .lean();
}

export const teacherService = {
  async forSession(session: SessionUser) {
    await dbConnect();
    const teacher = await Teacher.findOne({
      $or: [{ user: session.id }, { email: session.email.toLowerCase() }],
    })
      .select("employeeId firstName lastName designation department qualification branchCode subjects classes")
      .lean();
    if (!teacher) throw new ServiceError("FORBIDDEN", "Your login is not linked to a teacher profile", 403);
    return teacher;
  },

  async assignedClasses(session: SessionUser) {
    const teacher = await this.forSession(session);
    const assignedSubjectIds = new Set(teacher.subjects.map((subject: unknown) => String(subject)));
    const classes = await ClassModel.find({
      $or: [{ _id: { $in: teacher.classes } }, { classTeacher: teacher._id }],
    })
      .populate("subjects", "name code")
      .sort({ level: 1, name: 1, section: 1 })
      .lean();
    return classes.map((item) => ({
      ...item,
      subjects: (item.subjects || []).filter((subject: { _id: unknown }) =>
        assignedSubjectIds.has(String(subject._id))
      ),
    }));
  },

  async assertClassAssigned(session: SessionUser, classId: string) {
    const teacher = await this.forSession(session);
    const assigned = await ClassModel.exists({
      _id: classId,
      $or: [{ _id: { $in: teacher.classes } }, { classTeacher: teacher._id }],
    });
    if (!assigned) throw new ServiceError("FORBIDDEN", "This class is not assigned to your teacher account", 403);
    return teacher;
  },

  async assertSubjectAssigned(session: SessionUser, classId: string, subjectId: string) {
    const teacher = await this.assertClassAssigned(session, classId);
    const assignedSubject = teacher.subjects.some((id: unknown) => String(id) === subjectId);
    const inClass = await ClassModel.exists({ _id: classId, subjects: subjectId });
    if (!assignedSubject || !inClass) {
      throw new ServiceError("FORBIDDEN", "This subject is not assigned to you for this class", 403);
    }
    return teacher;
  },

  async list(branchCode?: string | null) {
    await dbConnect();
    const filter = branchCode ? { branchCode: branchCode.toUpperCase() } : {};
    return Teacher.find(filter)
      .populate("subjects", "name code")
      .populate("classes", "name section")
      .sort({ firstName: 1 })
      .lean();
  },

  async getById(id: string) {
    await dbConnect();
    const item = await populated(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    return item;
  },

  async create(data: TeacherInput) {
    await dbConnect();
    const modes = await numberingService.idModes();
    const employeeId = await numberingService.resolveCode({
      kind: "teacher",
      provided: data.employeeId,
      mode: modes.employeeIdMode,
      branch: data.branchCode,
      label: "Employee ID",
    });
    const exists = await Teacher.findOne({ employeeId }).lean();
    if (exists) {
      throw new ServiceError("VALIDATION", `Employee ID ${employeeId} already exists`, 409);
    }
    const item = await Teacher.create({ ...toPayload(data), employeeId });
    return populated(String(item._id));
  },

  async update(id: string, data: TeacherInput) {
    await dbConnect();
    const item = await Teacher.findByIdAndUpdate(id, toPayload(data), { new: true })
      .populate("subjects", "name code")
      .populate("classes", "name section");
    if (!item) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Teacher.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    return { ok: true };
  },
};
