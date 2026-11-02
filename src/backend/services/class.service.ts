/**
 * Class / section CRUD plus the default curriculum importer.
 */
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { Subject } from "@/backend/models/Subject";
import { CURRICULUM, canonicalSubjects, curriculumSummary } from "@/backend/data/curriculum";
import { ServiceError } from "@/backend/types";
import { setupRevision } from "@/backend/lib/setupHistory";
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
      .populate("classTeacher", "firstName lastName employeeId photoUpdatedAt")
      .populate("subjects", "name code credits stage")
      .sort({ level: 1, name: 1, section: 1 })
      .lean();
  },

  async getById(id: string) {
    await dbConnect();
    const item = await ClassModel.findById(id)
      .populate("classTeacher", "firstName lastName employeeId photoUpdatedAt")
      .populate("subjects", "name code credits stage")
      .lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return item;
  },

  async create(data: ClassInput, byName?: string) {
    await dbConnect();
    const payload = {
      ...data,
      branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
      classTeacher: data.classTeacher || undefined,
    };
    return ClassModel.create({
      ...payload,
      setupHistory: [
        setupRevision(`Created ${data.name}-${data.section}`, {
          ...payload,
          subjects: payload.subjects.map(String),
        }, byName),
      ],
    });
  },

  async update(id: string, data: ClassInput, byName?: string) {
    await dbConnect();
    const payload = {
      ...data,
      branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
      classTeacher: data.classTeacher || null,
    };
    const item = await ClassModel.findByIdAndUpdate(
      id,
      {
        $set: payload,
        $push: {
          setupHistory: setupRevision(`Updated ${data.name}-${data.section}`, {
            ...payload,
            subjects: payload.subjects.map(String),
          }, byName),
        },
      },
      { new: true, runValidators: true }
    );
    if (!item) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return item;
  },

  async setupHistory(id: string) {
    await dbConnect();
    const item = await ClassModel.findById(id).select("+setupHistory").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    return item.setupHistory || [];
  },

  async remove(id: string) {
    await dbConnect();
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
        subjects: canonicalSubjects().subjects.length,
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
    const stages = CURRICULUM.filter((stage) => input.stages.includes(stage.key));
    if (!stages.length) throw new ServiceError("VALIDATION", "Unknown stage selection", 400);

    // One subject per name across all levels (English is ENG from primary to intermediate).
    const { subjects: canonical, codeFor } = canonicalSubjects();
    const missing = stages.flatMap((s) => s.classes.flatMap((c) => c.subjects)).filter((code) => !codeFor.has(code));
    const neededCodes = new Set(stages.flatMap((s) => s.classes.flatMap((c) => c.subjects.map((code) => codeFor.get(code) || code))));
    const subjects = canonical.filter((s) => neededCodes.has(s.code));
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
            subjects: [...new Set(cls.subjects.map((code) => codeFor.get(code) || code))].map((code) => idByCode.get(code)).filter(Boolean),
          },
        }))
      )
    );

    const result = await ClassModel.bulkWrite(
      rows.map((row) => ({
        updateOne: {
          filter: row.filter,
          update: {
            $set: row.set,
            $setOnInsert: row.filter,
            $push: {
              setupHistory: setupRevision(
                `Curriculum refreshed for ${row.filter.name}-${row.filter.section}`,
                { ...row.filter, ...row.set }
              ),
            },
          },
          upsert: true,
        },
      })) as never,
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
