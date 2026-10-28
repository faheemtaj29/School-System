/**
 * Exam + nested results.
 */
import { dbConnect } from "@/backend/config/database";
import { Exam } from "@/backend/models/Exam";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { ExamSchedule, type IExamSchedule, type IExamScheduleRow } from "@/backend/models/ExamWorkflow";
import { ServiceError } from "@/backend/types";
import { teacherService } from "@/backend/services/teacher.service";
import type { SessionUser } from "@/backend/types";
import type { ExamInput, MarksheetInput } from "@/backend/validators/exam.validator";

function sumComponents(c?: { theory?: number; viva?: number; assignment?: number; attendance?: number; project?: number } | null) {
  if (!c) return 0;
  return (c.theory ?? 0) + (c.viva ?? 0) + (c.assignment ?? 0) + (c.attendance ?? 0) + (c.project ?? 0);
}

function toPayload(data: ExamInput) {
  return {
    ...data,
    date: new Date(data.date),
    teacherId: data.teacherId || undefined,
    results: (data.results || []).map((r) => ({
      ...r,
      marks: r.components ? sumComponents(r.components) : r.marks,
    })),
  };
}

async function populated(id: string) {
  return Exam.findById(id)
    .populate("classId", "name section")
    .populate("subjectId", "name code")
    .populate("teacherId", "firstName lastName")
    .populate("results.studentId", "firstName lastName admissionNo")
    .lean();
}

export const examService = {
  async list(session?: SessionUser) {
    await dbConnect();
    const assignedSubjectsByClass = session?.role === "teacher"
      ? new Map(
          (await teacherService.assignedClasses(session)).map((item) => [
            String(item._id),
            new Set((item.subjects || []).map((subject: { _id: unknown }) => String(subject._id))),
          ])
        )
      : null;
    const filter = assignedSubjectsByClass
      ? {
          classId: { $in: [...assignedSubjectsByClass.keys()] },
          subjectId: {
            $in: [...new Set([...assignedSubjectsByClass.values()].flatMap((subjects) => [...subjects]))],
          },
        }
      : {};
    const exams = await Exam.find(filter)
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .populate("teacherId", "firstName lastName")
      .populate("results.studentId", "firstName lastName admissionNo")
      .sort({ date: -1 })
      .lean();
    if (!assignedSubjectsByClass) return exams;
    return exams.filter((exam) => {
      const classId = String((exam.classId as { _id?: unknown })._id ?? exam.classId);
      const subjectId = String((exam.subjectId as { _id?: unknown })._id ?? exam.subjectId);
      return assignedSubjectsByClass.get(classId)?.has(subjectId);
    });
  },

  async create(data: ExamInput) {
    await dbConnect();
    const item = await Exam.create(toPayload(data));
    return populated(String(item._id));
  },

  async update(id: string, data: ExamInput) {
    await dbConnect();
    const item = await Exam.findByIdAndUpdate(
      id,
      { ...toPayload(data), teacherId: data.teacherId || null },
      { new: true }
    )
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .populate("teacherId", "firstName lastName")
      .populate("results.studentId", "firstName lastName admissionNo");
    if (!item) throw new ServiceError("NOT_FOUND", "Exam not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Exam.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Exam not found", 404);
    return { ok: true };
  },

  /** Return the mark sheet data for a class: students, subjects, existing marks. */
  async getMarksheet(
    classId: string,
    options: { subjectId?: string | null; scheduleId?: string | null; session: SessionUser }
  ) {
    await dbConnect();
    if (options.session.role === "teacher") {
      await teacherService.assertClassAssigned(options.session, classId);
      if (!options.scheduleId || !options.subjectId) {
        throw new ServiceError("VALIDATION", "Select a published exam schedule and subject", 400);
      }
      await teacherService.assertSubjectAssigned(options.session, classId, options.subjectId);
    }
    const cls = await ClassModel.findById(classId)
      .populate("subjects", "name code")
      .lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);

    let scheduleRow: { subjectId: unknown; totalMarks: number; passingMarks: number; examDate?: Date } | null = null;
    if (options.scheduleId) {
      const schedule: IExamSchedule | null = await ExamSchedule.findById(options.scheduleId).lean();
      if (!schedule || String(schedule.classId) !== classId || schedule.status !== "published") {
        throw new ServiceError("NOT_FOUND", "Published exam schedule not found for this class", 404);
      }
      scheduleRow = schedule.rows.find(
        (row: IExamScheduleRow) =>
          String(row.subjectId) === options.subjectId &&
          row.status === "published"
      ) ?? null;
      if (!scheduleRow) {
        throw new ServiceError("FORBIDDEN", "This subject is not published in the selected exam schedule", 403);
      }
    }

    const [students, exams] = await Promise.all([
      Student.find({ classId }).sort({ rollNumber: 1, firstName: 1 }).lean(),
      Exam.find(options.scheduleId ? {
        classId,
        subjectId: options.subjectId,
        $or: [
          { scheduleId: options.scheduleId },
          ...(scheduleRow?.examDate ? [{ date: scheduleRow.examDate }] : []),
        ],
      } : { classId })
        .populate("subjectId", "name code")
        .lean(),
    ]);

    const classSubjects = (cls.subjects || []) as { _id: unknown; name: string; code?: string }[];
    const subjectIds = options.subjectId
      ? [options.subjectId]
      : classSubjects.map((subject: { _id: unknown }) => String(subject._id));
    const subjects = classSubjects
      .filter((subject) => subjectIds.includes(String(subject._id)));
    if (options.subjectId && !subjects.length) {
      throw new ServiceError("FORBIDDEN", "This subject is not assigned to the selected class", 403);
    }
    return { cls, students, exams, subjects, scheduleRow };
  },

  /**
   * Bulk-save a mark sheet: upserts one Exam per subject in the class.
   * Auto-calculates `marks` as the sum of components.
   */
  async saveMarksheet(input: MarksheetInput, session: SessionUser) {
    await dbConnect();
    if (!input.subjects.length) {
      throw new ServiceError("VALIDATION", "Select at least one subject before saving marks", 400);
    }
    if (Number.isNaN(new Date(input.date).getTime())) {
      throw new ServiceError("VALIDATION", "Enter a valid marks date", 400);
    }
    const cls = await ClassModel.findById(input.classId).lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    const classSubjectIds = new Set((cls.subjects || []).map((id: unknown) => String(id)));
    const rosterIds = new Set(
      (await Student.find({ classId: input.classId }).select("_id").lean())
        .map((student: { _id: unknown }) => String(student._id))
    );
    const schedule: IExamSchedule | null = input.scheduleId
      ? await ExamSchedule.findById(input.scheduleId).lean()
      : null;
    if (session.role === "teacher" && !input.scheduleId) {
      throw new ServiceError("FORBIDDEN", "Marks can only be entered for a published exam schedule", 403);
    }
    if (input.scheduleId && (
      !schedule ||
      String(schedule.classId) !== input.classId ||
      schedule.status !== "published"
    )) {
      throw new ServiceError("FORBIDDEN", "Marks can only be entered for a published exam schedule", 403);
    }

    const scheduleRows = new Map<string, IExamScheduleRow>(
      (schedule?.rows || [])
        .filter((row: IExamScheduleRow) => row.status === "published")
        .map((row: IExamScheduleRow) => [String(row.subjectId), row])
    );
    for (const subject of input.subjects) {
      if (!classSubjectIds.has(subject.subjectId)) {
        throw new ServiceError("FORBIDDEN", "A selected subject is not assigned to this class", 403);
      }
      if (session.role === "teacher") {
        await teacherService.assertSubjectAssigned(session, input.classId, subject.subjectId);
      }
      const scheduleRow = input.scheduleId ? scheduleRows.get(subject.subjectId) : undefined;
      if (input.scheduleId && !scheduleRow) {
        throw new ServiceError("FORBIDDEN", "A selected subject is not published in this exam schedule", 403);
      }
      if (scheduleRow && (
        subject.maxMarks !== scheduleRow.totalMarks ||
        (scheduleRow.examDate && new Date(input.date).toISOString().slice(0, 10) !== scheduleRow.examDate.toISOString().slice(0, 10))
      )) {
        throw new ServiceError("VALIDATION", "Marks date and maximum marks must match the published schedule", 400);
      }
      const submittedStudentIds = subject.students.map((student) => student.studentId);
      if (
        new Set(submittedStudentIds).size !== submittedStudentIds.length ||
        submittedStudentIds.some((id) => !rosterIds.has(id))
      ) {
        throw new ServiceError("VALIDATION", "Marks must contain unique students from the selected class", 400);
      }
      if (subject.markComponents && subject.students.some((student) =>
        Object.entries(student.components).some(([key, mark]) => {
          const maximum = subject.markComponents?.[key as keyof typeof subject.markComponents];
          return maximum != null && mark > maximum;
        })
      )) {
        throw new ServiceError("VALIDATION", "A mark exceeds its configured component maximum", 400);
      }
      if (
        subject.markComponents &&
        Math.abs(Object.values(subject.markComponents).reduce((sum, value) => sum + (value || 0), 0) - subject.maxMarks) > 0.01
      ) {
        throw new ServiceError("VALIDATION", "Component maximums must add up to the subject maximum", 400);
      }
    }

    const gradeFromPct = (pct: number) => {
      if (pct >= 90) return "A+";
      if (pct >= 80) return "A";
      if (pct >= 70) return "B+";
      if (pct >= 60) return "B";
      if (pct >= 50) return "C";
      if (pct >= 40) return "D";
      return "F";
    };

    const ops = input.subjects.map((sub) => {
      const results = sub.students.map((s) => {
        const total = sumComponents(s.components);
        if (total > sub.maxMarks) {
          throw new ServiceError("VALIDATION", "A student's total marks exceed the subject maximum", 400);
        }
        const pct = sub.maxMarks > 0 ? Math.round((total / sub.maxMarks) * 100) : 0;
        return {
          studentId: s.studentId,
          marks: total,
          components: s.components,
          grade: gradeFromPct(pct),
        };
      });

      const title = `${cls.name}-${cls.section} ${input.termLabel || input.examType} ${input.academicYear}`;
      return Exam.findOneAndUpdate(
        input.scheduleId
          ? { scheduleId: input.scheduleId, subjectId: sub.subjectId }
          : {
              classId: input.classId,
              subjectId: sub.subjectId,
              examType: input.examType,
              title,
            },
        {
          $set: {
            title,
            examType: input.examType,
            classId: input.classId,
            subjectId: sub.subjectId,
            scheduleId: input.scheduleId,
            date: new Date(input.date),
            maxMarks: sub.maxMarks,
            markComponents: sub.markComponents,
            results,
          },
        },
        { upsert: true, new: true }
      );
    });

    await Promise.all(ops);
    return { saved: ops.length };
  },
};
