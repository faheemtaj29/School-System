/**
 * Subject CRUD, teacher assignment and merging duplicates.
 */

/** Exam records that point at a subject (these block delete/merge so no marks are lost). */
async function examUse(id: string) {
  const [marks, schedules, tests] = await Promise.all([
    ExamMark.countDocuments({ subjectId: id }),
    ExamSchedule.countDocuments({ "rows.subjectId": id }),
    Exam.countDocuments({ subjectId: id }),
  ]);
  return { marks, schedules, tests, total: marks + schedules + tests };
}

async function mustFind(id: string) {
  if (!isValidObjectId(id)) throw new ServiceError("VALIDATION", "Invalid subject ID", 400);
  const item = await Subject.findById(id).lean();
  if (!item) throw new ServiceError("NOT_FOUND", "Subject not found", 404);
  return item;
}
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { TimetableSlot } from "@/backend/models/CampusModules";
import { Exam } from "@/backend/models/Exam";
import { ExamMark, ExamSchedule } from "@/backend/models/ExamWorkflow";
import { Subject } from "@/backend/models/Subject";
import { Teacher } from "@/backend/models/Teacher";
import { ServiceError } from "@/backend/types";
import type { SubjectInput } from "@/backend/validators/subject.validator";

export const subjectService = {
  async list() {
    await dbConnect();
    /** Keeps the first visit consistent with the Classes screen. */
    if ((await Subject.estimatedDocumentCount()) === 0) {
      const { classService } = await import("@/backend/services/class.service");
      await classService.list();
    }
    return Subject.find().sort({ stage: 1, name: 1 }).lean();
  },

  async create(data: SubjectInput) {
    await dbConnect();
    return Subject.create(data);
  },

  async update(id: string, data: SubjectInput) {
    await dbConnect();
    const item = await Subject.findByIdAndUpdate(id, data, { new: true });
    if (!item) throw new ServiceError("NOT_FOUND", "Subject not found", 404);
    return item;
  },

  /** Deletes a subject and unlinks it from classes, teachers and the timetable. */
  async remove(id: string) {
    await dbConnect();
    const item = await mustFind(id);
    const use = await examUse(id);
    if (use.total) {
      throw new ServiceError(
        "CONFLICT",
        `${item.name} has exam records (${use.schedules} date sheet(s), ${use.marks} mark(s), ${use.tests} test(s)). Merge it into another subject instead of deleting.`,
        409
      );
    }
    await Promise.all([
      ClassModel.updateMany({ subjects: id }, { $pull: { subjects: id } }),
      Teacher.updateMany({ subjects: id }, { $pull: { subjects: id } }),
      TimetableSlot.updateMany({ subjectId: id }, { $unset: { subjectId: 1 } }),
    ]);
    await Subject.deleteOne({ _id: id });
    return { ok: true };
  },

  /** Exactly these teachers teach the subject (adds and removes the link on each teacher). */
  async setTeachers(id: string, teacherIds: string[]) {
    await dbConnect();
    await mustFind(id);
    const ids = teacherIds.filter((t) => isValidObjectId(t));
    await Teacher.updateMany({ _id: { $in: ids } }, { $addToSet: { subjects: id } });
    await Teacher.updateMany({ _id: { $nin: ids }, subjects: id }, { $pull: { subjects: id } });
    return { ok: true, teachers: ids.length };
  },

  /**
   * Folds a duplicate subject into another: classes, teachers and timetable move over,
   * then the duplicate is deleted. Refused when the duplicate already has exam records.
   */
  async merge(fromId: string, intoId: string) {
    await dbConnect();
    if (fromId === intoId) throw new ServiceError("VALIDATION", "Pick a different subject to merge into", 400);
    const [from, into] = await Promise.all([mustFind(fromId), mustFind(intoId)]);
    const use = await examUse(fromId);
    if (use.total) {
      throw new ServiceError(
        "CONFLICT",
        `${from.name} (${from.code}) already has exam records, so it can't be merged automatically. Rename it instead.`,
        409
      );
    }
    // $addToSet first, then $pull, so a class that had both ends up with one entry.
    const classes = await ClassModel.updateMany({ subjects: fromId }, { $addToSet: { subjects: intoId } });
    await ClassModel.updateMany({ subjects: fromId }, { $pull: { subjects: fromId } });
    const teachers = await Teacher.updateMany({ subjects: fromId }, { $addToSet: { subjects: intoId } });
    await Teacher.updateMany({ subjects: fromId }, { $pull: { subjects: fromId } });
    await TimetableSlot.updateMany({ subjectId: fromId }, { $set: { subjectId: intoId } });
    await Subject.deleteOne({ _id: fromId });
    return { ok: true, into: { _id: String(into._id), name: into.name, code: into.code }, classes: classes.modifiedCount, teachers: teachers.modifiedCount };
  },
};
