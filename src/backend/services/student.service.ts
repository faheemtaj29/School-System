/**
 * Student CRUD, class filter and automatic promotion of passed learners.
 */
import { dbConnect } from "@/backend/config/database";
import { Student } from "@/backend/models/Student";
import { ClassModel } from "@/backend/models/Class";
import { Settings } from "@/backend/models/Settings";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { PromoteInput, StudentInput } from "@/backend/validators/student.validator";
import { reportsService } from "@/backend/services/reports.service";
import { numberingService } from "@/backend/services/numbering.service";

/** Default fee concessions — used when percent is left blank on the form. */
export const DISCOUNT_DEFAULTS: Record<string, number> = {
  none: 0,
  teacher_child: 50,
  staff_child: 40,
  sibling: 25,
  merit: 100,
  need_based: 30,
  custom: 0,
};

function resolveDiscount(data: StudentInput) {
  const type = data.discountType || "none";
  const percent =
    data.discountPercent != null && data.discountPercent > 0
      ? data.discountPercent
      : DISCOUNT_DEFAULTS[type] ?? 0;
  return {
    discountType: type,
    discountPercent: type === "none" ? 0 : percent,
    linkedTeacherId:
      type === "teacher_child" || type === "staff_child"
        ? data.linkedTeacherId || undefined
        : undefined,
  };
}

function toPayload(data: StudentInput) {
  const discount = resolveDiscount(data);
  return {
    ...data,
    ...discount,
    email: data.email || undefined,
    parentEmail: data.parentEmail || undefined,
    branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    dateOfBirth: parseOptionalDate(data.dateOfBirth),
    admissionDate: parseOptionalDate(data.admissionDate) ?? new Date(),
  };
}

const populate = [
  { path: "classId", select: "name section academicYear level stream branchCode" },
  { path: "linkedTeacherId", select: "firstName lastName employeeId" },
];

export const studentService = {
  async list(classId?: string | null, branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (classId) filter.classId = classId;
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    return Student.find(filter).populate(populate).sort({ firstName: 1 }).lean();
  },

  async getById(id: string) {
    await dbConnect();
    const item = await Student.findById(id).populate(populate).lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    return item;
  },

  async create(data: StudentInput) {
    await dbConnect();
    const modes = await numberingService.idModes();
    const admissionNo = await numberingService.resolveCode({
      kind: "student",
      provided: data.admissionNo,
      mode: modes.studentIdMode,
      branch: data.branchCode,
      label: "Admission No.",
    });
    const exists = await Student.findOne({ admissionNo }).lean();
    if (exists) {
      throw new ServiceError("VALIDATION", `Admission No. ${admissionNo} already exists`, 409);
    }
    const item = await Student.create({ ...toPayload(data), admissionNo });
    return Student.findById(item._id).populate(populate).lean();
  },

  async update(id: string, data: StudentInput) {
    await dbConnect();
    const payload = {
      ...toPayload(data),
      admissionDate: parseOptionalDate(data.admissionDate),
    };
    const item = await Student.findByIdAndUpdate(id, payload, { new: true }).populate(populate);
    if (!item) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Student.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    return { ok: true };
  },

  /**
   * Promotes every student who passed the selected exams to the next class
   * on the curriculum ladder (matched by level + stream). Failures stay put;
   * students already at the top of the ladder are marked graduated.
   */
  async promotePassed(input: PromoteInput) {
    await dbConnect();
    const fromClass = await ClassModel.findById(input.classId).lean();
    if (!fromClass) throw new ServiceError("NOT_FOUND", "Class not found", 404);

    const cards = await reportsService.resultCards(input.classId, input.examType);
    const settings = await Settings.findOne().select("passPercent").lean();
    const passMark = input.passMark ?? settings?.passPercent ?? 40;

    const nextQuery: Record<string, unknown> = {
      level: (fromClass.level || 0) + 1,
    };
    if (fromClass.stream) nextQuery.stream = fromClass.stream;
    if (fromClass.branchCode) nextQuery.branchCode = fromClass.branchCode;

    let nextClass = await ClassModel.findOne(nextQuery).sort({ name: 1, section: 1 }).lean();
    if (!nextClass && fromClass.stream) {
      nextClass = await ClassModel.findOne({
        level: (fromClass.level || 0) + 1,
        stream: fromClass.stream,
      })
        .sort({ name: 1, section: 1 })
        .lean();
    }

    const promoted: { studentId: string; name: string; to: string }[] = [];
    const held: { studentId: string; name: string; percentage: number }[] = [];
    const graduated: { studentId: string; name: string }[] = [];

    for (const card of cards.cards) {
      const passed = card.percentage >= passMark && card.result === "PASS";
      if (!passed) {
        held.push({
          studentId: card.student._id,
          name: card.student.name,
          percentage: card.percentage,
        });
        continue;
      }

      if (!nextClass) {
        if (!input.dryRun) {
          await Student.findByIdAndUpdate(card.student._id, { status: "graduated" });
        }
        graduated.push({ studentId: card.student._id, name: card.student.name });
        continue;
      }

      if (!input.dryRun) {
        await Student.findByIdAndUpdate(card.student._id, { classId: nextClass._id });
      }
      promoted.push({
        studentId: card.student._id,
        name: card.student.name,
        to: `${nextClass.name}-${nextClass.section}`,
      });
    }

    return {
      from: `${fromClass.name}-${fromClass.section}`,
      next: nextClass ? `${nextClass.name}-${nextClass.section}` : null,
      dryRun: input.dryRun,
      passMark,
      promoted,
      held,
      graduated,
      summary: {
        promoted: promoted.length,
        held: held.length,
        graduated: graduated.length,
      },
    };
  },
};
