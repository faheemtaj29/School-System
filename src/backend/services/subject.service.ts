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
import { canonicalSubjects, plainCode, subjectKey } from "@/backend/data/curriculum";

/** Another subject already using this name (any spelling of case, spaces or dots)? */
async function nameTaken(name: string, exceptId?: string) {
  const key = subjectKey(name);
  const all = await Subject.find(exceptId ? { _id: { $ne: exceptId } } : {}).select("name code").lean();
  return all.find((x) => subjectKey(x.name) === key);
}

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
    const twin = await nameTaken(data.name);
    if (twin) {
      throw new ServiceError("CONFLICT", `${twin.name} already exists (code ${twin.code}). Use that subject for every class.`, 409);
    }
    return Subject.create(data);
  },

  async update(id: string, data: SubjectInput) {
    await dbConnect();
    const twin = await nameTaken(data.name, id);
    if (twin) {
      throw new ServiceError("CONFLICT", `${twin.name} already exists (code ${twin.code}). Merge the two instead of renaming.`, 409);
    }
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
    // A date sheet listing both subjects would end up with the same paper twice.
    const both = await ExamSchedule.exists({ "rows.subjectId": { $all: [from._id, into._id] } });
    if (both) {
      throw new ServiceError(
        "CONFLICT",
        `A date sheet has both ${from.code} and ${into.code} as separate papers. Remove one paper from it, then merge.`,
        409
      );
    }
    // Exam records move across too, so no marks or date sheets are lost.
    await Promise.all([
      ExamMark.updateMany({ subjectId: from._id }, { $set: { subjectId: into._id } }),
      Exam.updateMany({ subjectId: from._id }, { $set: { subjectId: into._id } }),
      ExamSchedule.updateMany(
        { "rows.subjectId": from._id },
        { $set: { "rows.$[r].subjectId": into._id } },
        { arrayFilters: [{ "r.subjectId": from._id }] }
      ),
    ]);
    // $addToSet first, then $pull, so a class that had both ends up with one entry.
    const classes = await ClassModel.updateMany({ subjects: fromId }, { $addToSet: { subjects: intoId } });
    await ClassModel.updateMany({ subjects: fromId }, { $pull: { subjects: fromId } });
    const teachers = await Teacher.updateMany({ subjects: fromId }, { $addToSet: { subjects: intoId } });
    await Teacher.updateMany({ subjects: fromId }, { $pull: { subjects: fromId } });
    await TimetableSlot.updateMany({ subjectId: fromId }, { $set: { subjectId: intoId } });
    await Subject.deleteOne({ _id: fromId });
    return { ok: true, into: { _id: String(into._id), name: into.name, code: into.code }, classes: classes.modifiedCount, teachers: teachers.modifiedCount };
  },

  /**
   * One subject per name: every duplicate (English PRI-ENG, MID-ENG, SEC-ENG…) is merged into
   * one, which takes a level-free code (ENG) — classes, teachers, timetable, date sheets and
   * marks all move to it.
   */
  async mergeAllDuplicates() {
    await dbConnect();
    const all = await Subject.find().lean();
    const groups = new Map<string, typeof all>();
    for (const x of all) groups.set(subjectKey(x.name), [...(groups.get(subjectKey(x.name)) || []), x]);
    const { subjects: canonical } = canonicalSubjects();
    const wanted = new Map(canonical.map((c) => [subjectKey(c.name), c.code]));
    const merged: { name: string; code: string; removed: string[] }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const [key, list] of groups) {
      if (list.length < 2) continue;
      // Keep the one most classes already use.
      const uses = await Promise.all(list.map((x) => ClassModel.countDocuments({ subjects: x._id })));
      const keepIdx = uses.indexOf(Math.max(...uses));
      const keep = list[keepIdx];
      const removed: string[] = [];
      try {
        for (const [i, x] of list.entries()) {
          if (i === keepIdx) continue;
          await this.merge(String(x._id), String(keep._id));
          removed.push(x.code);
        }
      } catch (e) {
        skipped.push({ name: keep.name, reason: (e as Error).message });
      }
      // A level-free code, unless another subject already uses it.
      const code = (wanted.get(key) || plainCode(keep.code)).toUpperCase();
      if (code !== keep.code && !(await Subject.exists({ code, _id: { $ne: keep._id } }))) {
        await Subject.updateOne({ _id: keep._id }, { $set: { code } });
      }
      const after = await Subject.findById(keep._id).select("code").lean();
      if (removed.length) merged.push({ name: keep.name, code: after?.code || keep.code, removed });
    }
    return { merged, skipped, subjects: await Subject.countDocuments() };
  },
};
