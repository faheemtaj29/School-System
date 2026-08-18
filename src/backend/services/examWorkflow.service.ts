import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Subject } from "@/backend/models/Subject";
import { ExamSchedule, ExamTerm, ExamTypeMaster } from "@/backend/models/ExamWorkflow";
import { ServiceError } from "@/backend/types";
import type {
  ExamScheduleInput,
  ExamTermInput,
  ExamTypeInput,
} from "@/backend/validators/examWorkflow.validator";

function normalizeInstitution(code?: string | null) {
  return (code || "MAIN").trim().toUpperCase();
}

function parseDate(value: string, label: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ServiceError("VALIDATION", `Invalid ${label}`, 400);
  }
  return d;
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function validateRows(rows: ExamScheduleInput["rows"], term: { startDate: Date; endDate: Date }) {
  const subjectSet = new Set<string>();

  for (const row of rows) {
    if (subjectSet.has(row.subjectId)) {
      throw new ServiceError("VALIDATION", "Duplicate subject in exam schedule", 400);
    }
    subjectSet.add(row.subjectId);

    if (row.passingMarks > row.totalMarks) {
      throw new ServiceError("VALIDATION", "Passing marks cannot exceed total marks", 400);
    }

    if (row.examDate) {
      const examDate = parseDate(row.examDate, "examDate");
      if (examDate < term.startDate || examDate > term.endDate) {
        throw new ServiceError(
          "VALIDATION",
          "Exam date must be within term start/end dates",
          400
        );
      }
    }

    if (row.startTime || row.endTime) {
      const start = timeToMinutes(row.startTime);
      const end = timeToMinutes(row.endTime);
      if (start == null || end == null) {
        throw new ServiceError("VALIDATION", "Invalid start/end time format (HH:mm)", 400);
      }
      if (start >= end) {
        throw new ServiceError("VALIDATION", "Start time must be before end time", 400);
      }
    }
  }

  // Conflict check within this schedule payload for same date/time overlaps.
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (!a.examDate || !b.examDate || a.examDate !== b.examDate) continue;
      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (aStart == null || aEnd == null || bStart == null || bEnd == null) continue;
      const overlap = aStart < bEnd && bStart < aEnd;
      if (overlap) {
        throw new ServiceError("VALIDATION", "Overlapping exam times in schedule rows", 400);
      }
    }
  }
}

async function classSubjectRows(
  classId: string,
  defaults: { totalMarks: number; passingMarks: number }
) {
  const cls = await ClassModel.findById(classId).populate("subjects", "name code").lean();
  if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);
  const subjects = (cls.subjects || []) as { _id: unknown }[];
  if (!subjects.length) {
    throw new ServiceError("VALIDATION", "No subjects assigned to selected class", 400);
  }
  return subjects.map((s) => ({
    subjectId: String(s._id),
    totalMarks: defaults.totalMarks,
    passingMarks: defaults.passingMarks,
    status: "draft" as const,
  }));
}

export const examWorkflowService = {
  async listTypes(institutionCode?: string | null) {
    await dbConnect();
    return ExamTypeMaster.find({ institutionCode: normalizeInstitution(institutionCode) })
      .sort({ name: 1 })
      .lean();
  },

  async createType(data: ExamTypeInput) {
    await dbConnect();
    if (data.defaultPassingMarks > data.defaultMaxMarks) {
      throw new ServiceError("VALIDATION", "Default passing marks cannot exceed max marks", 400);
    }
    return ExamTypeMaster.create({
      ...data,
      key: data.key.trim().toUpperCase(),
      institutionCode: normalizeInstitution(data.institutionCode),
    });
  },

  async updateType(id: string, data: ExamTypeInput) {
    await dbConnect();
    if (data.defaultPassingMarks > data.defaultMaxMarks) {
      throw new ServiceError("VALIDATION", "Default passing marks cannot exceed max marks", 400);
    }
    const item = await ExamTypeMaster.findByIdAndUpdate(
      id,
      {
        ...data,
        key: data.key.trim().toUpperCase(),
        institutionCode: normalizeInstitution(data.institutionCode),
      },
      { new: true }
    );
    if (!item) throw new ServiceError("NOT_FOUND", "Exam type not found", 404);
    return item;
  },

  async removeType(id: string) {
    await dbConnect();
    const used = await ExamTerm.exists({ examTypeId: id });
    if (used) {
      throw new ServiceError("CONFLICT", "Exam type is used by existing terms", 409);
    }
    const item = await ExamTypeMaster.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Exam type not found", 404);
    return { ok: true };
  },

  async listTerms(filters: { institutionCode?: string | null; academicYear?: string | null }) {
    await dbConnect();
    const query = { institutionCode: normalizeInstitution(filters.institutionCode) } as Record<
      string,
      unknown
    >;
    if (filters.academicYear) query.academicYear = filters.academicYear;
    return ExamTerm.find(query)
      .populate("examTypeId", "key name category")
      .sort({ academicYear: -1, startDate: 1 })
      .lean();
  },

  async createTerm(data: ExamTermInput) {
    await dbConnect();
    const startDate = parseDate(data.startDate, "startDate");
    const endDate = parseDate(data.endDate, "endDate");
    if (startDate > endDate) {
      throw new ServiceError("VALIDATION", "Term start date cannot be after end date", 400);
    }
    return ExamTerm.create({
      ...data,
      examTypeId: data.examTypeId || undefined,
      institutionCode: normalizeInstitution(data.institutionCode),
      startDate,
      endDate,
    });
  },

  async updateTerm(id: string, data: ExamTermInput) {
    await dbConnect();
    const startDate = parseDate(data.startDate, "startDate");
    const endDate = parseDate(data.endDate, "endDate");
    if (startDate > endDate) {
      throw new ServiceError("VALIDATION", "Term start date cannot be after end date", 400);
    }
    const item = await ExamTerm.findByIdAndUpdate(
      id,
      {
        ...data,
        examTypeId: data.examTypeId || null,
        institutionCode: normalizeInstitution(data.institutionCode),
        startDate,
        endDate,
      },
      { new: true }
    );
    if (!item) throw new ServiceError("NOT_FOUND", "Exam term not found", 404);
    return item;
  },

  async removeTerm(id: string) {
    await dbConnect();
    const used = await ExamSchedule.exists({ termId: id });
    if (used) throw new ServiceError("CONFLICT", "Term has schedules and cannot be removed", 409);
    const item = await ExamTerm.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Exam term not found", 404);
    return { ok: true };
  },

  async classSubjects(classId: string) {
    await dbConnect();
    const cls = await ClassModel.findById(classId).populate("subjects", "name code credits").lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return {
      class: cls,
      subjects: (cls.subjects || []) as { _id: unknown; name: string; code: string; credits: number }[],
    };
  },

  async listSchedules(filters: {
    institutionCode?: string | null;
    academicYear?: string | null;
    termId?: string | null;
    classId?: string | null;
  }) {
    await dbConnect();
    const query = { institutionCode: normalizeInstitution(filters.institutionCode) } as Record<
      string,
      unknown
    >;
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.termId) query.termId = filters.termId;
    if (filters.classId) query.classId = filters.classId;
    return ExamSchedule.find(query)
      .populate("termId", "name academicYear status startDate endDate")
      .populate("examTypeId", "key name category")
      .populate("classId", "name section academicYear")
      .populate("rows.subjectId", "name code")
      .populate("rows.invigilatorId", "firstName lastName employeeId")
      .sort({ academicYear: -1, updatedAt: -1 })
      .lean();
  },

  async createSchedule(data: ExamScheduleInput, userId?: string) {
    await dbConnect();
    const institutionCode = normalizeInstitution(data.institutionCode);
    const term = await ExamTerm.findById(data.termId).lean();
    if (!term) throw new ServiceError("NOT_FOUND", "Exam term not found", 404);

    const examType = data.examTypeId
      ? await ExamTypeMaster.findById(data.examTypeId).lean()
      : term.examTypeId
        ? await ExamTypeMaster.findById(term.examTypeId).lean()
        : null;

    const fallbackMarks = {
      totalMarks: examType?.defaultMaxMarks || 100,
      passingMarks: examType?.defaultPassingMarks || 40,
    };

    const rows =
      data.rows.length > 0
        ? data.rows
        : await classSubjectRows(data.classId, fallbackMarks);

    validateRows(rows, { startDate: term.startDate, endDate: term.endDate });

    const subjectIds = rows.map((r) => r.subjectId);
    const count = await Subject.countDocuments({ _id: { $in: subjectIds } });
    if (count !== subjectIds.length) {
      throw new ServiceError("VALIDATION", "One or more subjects in schedule are invalid", 400);
    }

    const item = await ExamSchedule.create({
      ...data,
      examTypeId: data.examTypeId || term.examTypeId || undefined,
      institutionCode,
      rows: rows.map((r) => ({
        ...r,
        examDate: r.examDate ? new Date(r.examDate) : undefined,
        invigilatorId: r.invigilatorId || undefined,
      })),
      createdBy: userId || undefined,
      updatedBy: userId || undefined,
      publishedAt: data.status === "published" ? new Date() : undefined,
    });

    return ExamSchedule.findById(item._id)
      .populate("termId", "name academicYear status")
      .populate("classId", "name section")
      .populate("rows.subjectId", "name code")
      .lean();
  },

  async updateSchedule(id: string, data: ExamScheduleInput, userId?: string) {
    await dbConnect();
    const existing = await ExamSchedule.findById(id).lean();
    if (!existing) throw new ServiceError("NOT_FOUND", "Exam schedule not found", 404);

    const term = await ExamTerm.findById(data.termId).lean();
    if (!term) throw new ServiceError("NOT_FOUND", "Exam term not found", 404);

    const rows = data.rows;
    validateRows(rows, { startDate: term.startDate, endDate: term.endDate });

    const item = await ExamSchedule.findByIdAndUpdate(
      id,
      {
        ...data,
        institutionCode: normalizeInstitution(data.institutionCode),
        rows: rows.map((r) => ({
          ...r,
          examDate: r.examDate ? new Date(r.examDate) : undefined,
          invigilatorId: r.invigilatorId || undefined,
        })),
        updatedBy: userId || undefined,
        publishedAt: data.status === "published" ? new Date() : undefined,
      },
      { new: true }
    )
      .populate("termId", "name academicYear status")
      .populate("classId", "name section")
      .populate("rows.subjectId", "name code");

    if (!item) throw new ServiceError("NOT_FOUND", "Exam schedule not found", 404);
    return item;
  },

  async removeSchedule(id: string) {
    await dbConnect();
    const item = await ExamSchedule.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Exam schedule not found", 404);
    return { ok: true };
  },
};
