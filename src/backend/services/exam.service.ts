/**
 * Exam + nested results.
 */
import { dbConnect } from "@/backend/config/database";
import { Exam } from "@/backend/models/Exam";
import { ServiceError } from "@/backend/types";
import type { ExamInput } from "@/backend/validators/exam.validator";

function toPayload(data: ExamInput) {
  return {
    ...data,
    date: new Date(data.date),
    teacherId: data.teacherId || undefined,
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
};
