/**
 * Teacher CRUD with related subjects + classes.
 */
import { dbConnect } from "@/backend/config/database";
import { Teacher } from "@/backend/models/Teacher";
import { Attendance } from "@/backend/models/Attendance";
import { Exam } from "@/backend/models/Exam";
import { ClassModel } from "@/backend/models/Class";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { TeacherInput } from "@/backend/validators/teacher.validator";
import { numberingService } from "@/backend/services/numbering.service";

function normalizeBranch(code?: string | null) {
  const clean = code?.trim();
  return clean ? clean.toUpperCase() : undefined;
}

async function resolveTeacherBranchForClasses(input: {
  classes?: string[];
  branchCode?: string;
  fallbackBranchCode?: string;
}) {
  const classIds = input.classes || [];
  const requestedBranch = normalizeBranch(input.branchCode || input.fallbackBranchCode);
  if (!classIds.length) return requestedBranch;

  const classes = await ClassModel.find({ _id: { $in: classIds } })
    .select("branchCode")
    .lean();
  if (classes.length !== classIds.length) {
    throw new ServiceError("NOT_FOUND", "One or more selected classes do not exist", 404);
  }

  const classBranches = [...new Set(classes.map((c) => normalizeBranch(c.branchCode)).filter(Boolean))];
  if (classBranches.length > 1) {
    throw new ServiceError(
      "VALIDATION",
      "Assigned classes must belong to the same branch",
      400
    );
  }

  const classBranch = classBranches[0];
  if (requestedBranch && classBranch && requestedBranch !== classBranch) {
    throw new ServiceError(
      "VALIDATION",
      "Teacher branch must match assigned class branch",
      400
    );
  }

  return requestedBranch || classBranch;
}

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
    const classIds = (item.classes || []).map((value: { _id: unknown }) => value._id);
    const [attendance, exams] = await Promise.all([
      Attendance.find({ classId: { $in: classIds } }).sort({ date: -1 }).limit(120).lean(),
      Exam.find({ $or: [{ teacherId: id }, { classId: { $in: classIds } }] })
        .populate("classId", "name section")
        .populate("subjectId", "name code")
        .sort({ date: -1 })
        .limit(60)
        .lean(),
    ]);
    const performance = new Map<string, { label: string; exams: number; marks: number; max: number }>();
    for (const exam of exams) {
      const cls = exam.classId as unknown as { _id?: unknown; name?: string; section?: string };
      const key = String(cls?._id || exam.classId);
      const entry = performance.get(key) || { label: `${cls?.name || "Class"}${cls?.section ? `-${cls.section}` : ""}`, exams: 0, marks: 0, max: 0 };
      entry.exams += 1;
      for (const result of exam.results || []) {
        entry.marks += result.marks || 0;
        entry.max += exam.maxMarks || 0;
      }
      performance.set(key, entry);
    }
    return {
      ...item,
      profile: {
        attendance,
        exams,
        performanceByClass: [...performance.values()].map((entry) => ({
          ...entry,
          averagePercent: entry.max ? Math.round((entry.marks / entry.max) * 100) : 0,
        })),
      },
    };
  },

  async create(data: TeacherInput) {
    await dbConnect();
    const branchCode = await resolveTeacherBranchForClasses({
      classes: data.classes,
      branchCode: data.branchCode,
    });
    const payloadInput: TeacherInput = { ...data, branchCode };
    const modes = await numberingService.idModes();
    const employeeId = await numberingService.resolveCode({
      kind: "teacher",
      provided: data.employeeId,
      mode: modes.employeeIdMode,
      branch: payloadInput.branchCode,
      label: "Employee ID",
    });
    const exists = await Teacher.findOne({ employeeId }).lean();
    if (exists) {
      throw new ServiceError("VALIDATION", `Employee ID ${employeeId} already exists`, 409);
    }
    const item = await Teacher.create({ ...toPayload(payloadInput), employeeId });
    return populated(String(item._id));
  },

  async update(id: string, data: TeacherInput) {
    await dbConnect();
    const existing = await Teacher.findById(id).select("branchCode").lean();
    if (!existing) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    const branchCode = await resolveTeacherBranchForClasses({
      classes: data.classes,
      branchCode: data.branchCode,
      fallbackBranchCode: existing.branchCode,
    });
    const payloadInput: TeacherInput = { ...data, branchCode };
    const item = await Teacher.findByIdAndUpdate(id, toPayload(payloadInput), { new: true })
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
