/**
 * Class / section CRUD plus the default curriculum importer.
 */
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { Subject } from "@/backend/models/Subject";
import { assertSessionWritableForYear } from "@/backend/lib/sessionGuard";
import { CURRICULUM, CURRICULUM_SUBJECTS, curriculumSummary } from "@/backend/data/curriculum";
import { ServiceError } from "@/backend/types";
import type { ClassInput, CurriculumImportInput } from "@/backend/validators/class.validator";

/** Shared between parallel first requests so the ladder is only seeded once. */
let seeding: Promise<unknown> | null = null;

/**
 * A brand new school starts with the full academic ladder already in place.
 * Only runs while both collections are empty, so it never fights an admin
 * who has trimmed the list.
 */
async function ensureCurriculum() {
  await dbConnect();
  const [classes, subjects] = await Promise.all([
    ClassModel.estimatedDocumentCount(),
    Subject.estimatedDocumentCount(),
  ]);
  if (classes > 0 || subjects > 0) return;
  seeding ??= classService
    .importCurriculum({
      stages: CURRICULUM.map((s) => s.key),
      academicYear: new Date().getFullYear().toString(),
      sections: ["A"],
    })
    .finally(() => {
      seeding = null;
    });
  await seeding;
}

export const classService = {
  async list() {
    await ensureCurriculum();
    return ClassModel.find()
      .populate("classTeacher", "firstName lastName employeeId")
      .populate("subjects", "name code credits stage")
      .sort({ level: 1, name: 1, section: 1 })
      .lean();
  },

  async getById(id: string) {
    await dbConnect();
    const item = await ClassModel.findById(id)
      .populate("classTeacher", "firstName lastName employeeId")
      .populate("subjects", "name code credits stage")
      .lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return item;
  },

  async create(data: ClassInput) {
    await dbConnect();
    await assertSessionWritableForYear(data.academicYear);
    return ClassModel.create({
      ...data,
      branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
      classTeacher: data.classTeacher || undefined,
    });
  },

  async update(id: string, data: ClassInput) {
    await dbConnect();
    const existing = await ClassModel.findById(id).select("academicYear").lean();
    if (!existing) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    const sourceYear = existing.academicYear?.trim();
    const targetYear = data.academicYear?.trim() || sourceYear;
    if (sourceYear) {
      await assertSessionWritableForYear(sourceYear);
    }
    if (targetYear && targetYear !== sourceYear) {
      await assertSessionWritableForYear(targetYear);
    }
    const item = await ClassModel.findByIdAndUpdate(
      id,
      {
        ...data,
        branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
        classTeacher: data.classTeacher || null,
      },
      { new: true }
    );
    if (!item) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const cls = await ClassModel.findById(id).select("academicYear").lean();
    if (cls?.academicYear) {
      await assertSessionWritableForYear(cls.academicYear);
    }
    const enrolled = await Student.countDocuments({ classId: id });
    if (enrolled > 0) {
      throw new ServiceError(
        "CONFLICT",
        `${enrolled} student(s) are enrolled in this class. Move them first.`,
        409
      );
    }
    const item = await ClassModel.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return { ok: true };
  },

  /** Catalog preview for the Curriculum Library screen. */
  catalog() {
    return {
      stages: curriculumSummary(),
      totals: {
        classes: CURRICULUM.reduce((sum, s) => sum + s.classes.length, 0),
        subjects: CURRICULUM_SUBJECTS.length,
      },
    };
  },

  /**
   * Creates the subjects and class/section rows of the selected stages.
   * Upserts on subject code and on (name, section, academicYear), so running
   * it twice refreshes the mapping instead of duplicating records.
   */
  async importCurriculum(input: CurriculumImportInput) {
    await dbConnect();
    await assertSessionWritableForYear(input.academicYear);
    const stages = CURRICULUM.filter((stage) => input.stages.includes(stage.key));
    if (!stages.length) throw new ServiceError("VALIDATION", "Unknown stage selection", 400);

    const neededCodes = new Set(stages.flatMap((s) => s.classes.flatMap((c) => c.subjects)));
    const subjects = CURRICULUM_SUBJECTS.filter((s) => neededCodes.has(s.code));
    const missing = [...neededCodes].filter((code) => !subjects.some((s) => s.code === code));
    if (missing.length) {
      throw new ServiceError("INTERNAL", `Curriculum references unknown subject: ${missing[0]}`, 500);
    }

    await Subject.bulkWrite(
      subjects.map((s) => ({
        updateOne: {
          filter: { code: s.code },
          update: {
            $set: { name: s.name, credits: s.credits, stage: s.stage },
            $setOnInsert: { code: s.code },
          },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    const saved = await Subject.find({ code: { $in: [...neededCodes] } }, { code: 1 }).lean();
    const idByCode = new Map(saved.map((s) => [s.code, s._id]));

    const sections = input.sections.length ? input.sections : ["A"];
    const branchCode = input.branchCode ? input.branchCode.toUpperCase() : undefined;
    const rows = stages.flatMap((stage) =>
      stage.classes.flatMap((cls) =>
        sections.map((section) => ({
          filter: { name: cls.name, section, academicYear: input.academicYear },
          set: {
            stage: stage.key,
            stream: cls.stream,
            level: cls.level,
            capacity: cls.capacity,
            branchCode,
            subjects: cls.subjects.map((code) => idByCode.get(code)).filter(Boolean),
          },
        }))
      )
    );

    const result = await ClassModel.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: row.filter,
          update: { $set: row.set, $setOnInsert: row.filter },
          upsert: true,
        },
      })),
      { ordered: false }
    );

    return {
      stages: stages.map((s) => s.label),
      subjects: subjects.length,
      classesCreated: result.upsertedCount,
      classesUpdated: result.modifiedCount,
      academicYear: input.academicYear,
      sections,
    };
  },
};
