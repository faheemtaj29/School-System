/**
 * Exam + nested results.
 */
import { dbConnect } from "@/backend/config/database";
import { Exam } from "@/backend/models/Exam";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { ServiceError } from "@/backend/types";
import { setupRevision } from "@/backend/lib/setupHistory";
import type { ExamInput, MarksheetInput } from "@/backend/validators/exam.validator";

type HistoryActor = { name?: string };

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
  async list() {
    await dbConnect();
    return Exam.find()
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .populate("teacherId", "firstName lastName")
      .populate("results.studentId", "firstName lastName admissionNo")
      .sort({ date: -1 })
      .lean();
  },

  async create(data: ExamInput, actor?: HistoryActor) {
    await dbConnect();
    const payload = toPayload(data);
    const item = await Exam.create({
      ...payload,
      setupHistory: [
        setupRevision(`Created ${data.title}`, {
          ...payload,
          results: payload.results.map((result) => ({ ...result, studentId: String(result.studentId) })),
        }, actor?.name),
      ],
    });
    return populated(String(item._id));
  },

  async update(id: string, data: ExamInput, actor?: HistoryActor) {
    await dbConnect();
    const payload = { ...toPayload(data), teacherId: data.teacherId || null };
    const item = await Exam.findByIdAndUpdate(
      id,
      {
        $set: payload,
        $push: {
          setupHistory: setupRevision(`Updated ${data.title}`, {
            ...payload,
            results: payload.results.map((result) => ({ ...result, studentId: String(result.studentId) })),
          }, actor?.name),
        },
      },
      { new: true, runValidators: true }
    )
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .populate("teacherId", "firstName lastName")
      .populate("results.studentId", "firstName lastName admissionNo");
    if (!item) throw new ServiceError("NOT_FOUND", "Exam not found", 404);
    return item;
  },

  async setupHistory(id: string) {
    await dbConnect();
    const item = await Exam.findById(id).select("+setupHistory").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Exam not found", 404);
    return item.setupHistory || [];
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Exam.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Exam not found", 404);
    return { ok: true };
  },

  /** Return the mark sheet data for a class: students, subjects, existing marks. */
  async getMarksheet(classId: string) {
    await dbConnect();
    const cls = await ClassModel.findById(classId)
      .populate("subjects", "name code")
      .lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);

    const [students, exams] = await Promise.all([
      Student.find({ classId }).sort({ rollNumber: 1, firstName: 1 }).lean(),
      Exam.find({ classId }).populate("subjectId", "name code").lean(),
    ]);

    return { cls, students, exams };
  },

  /**
   * Bulk-save a mark sheet: upserts one Exam per subject in the class.
   * Auto-calculates `marks` as the sum of components.
   */
  async saveMarksheet(input: MarksheetInput, actor?: HistoryActor) {
    await dbConnect();
    const cls = await ClassModel.findById(input.classId).lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);

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
        const pct = sub.maxMarks > 0 ? Math.round((total / sub.maxMarks) * 100) : 0;
        return {
          studentId: s.studentId,
          marks: total,
          components: s.components,
          grade: gradeFromPct(pct),
        };
      });

      const title = `${cls.name}-${cls.section} ${input.termLabel || input.examType} ${input.academicYear}`;
      const payload = {
        title,
        examType: input.examType,
        classId: input.classId,
        subjectId: sub.subjectId,
        date: new Date(input.date),
        maxMarks: sub.maxMarks,
        markComponents: sub.markComponents,
        results,
      };
      return Exam.findOneAndUpdate(
        {
          classId: input.classId,
          subjectId: sub.subjectId,
          examType: input.examType,
          title,
        },
        {
          $set: payload,
          $push: {
            setupHistory: setupRevision(
              `Saved ${title} · ${results.length} students`,
              {
                ...payload,
                classId: String(input.classId),
                subjectId: String(sub.subjectId),
                results: results.map((result) => ({ ...result, studentId: String(result.studentId) })),
              },
              actor?.name
            ),
          },
        },
        { upsert: true, new: true }
      );
    });

    await Promise.all(ops);
    return { saved: ops.length };
  },
};
