/**
 * Student CRUD + class filter.
 */
import { dbConnect } from "@/backend/config/database";
import { Student } from "@/backend/models/Student";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { StudentInput } from "@/backend/validators/student.validator";

function toPayload(data: StudentInput) {
  return {
    ...data,
    email: data.email || undefined,
    parentEmail: data.parentEmail || undefined,
    branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    dateOfBirth: parseOptionalDate(data.dateOfBirth),
    admissionDate: parseOptionalDate(data.admissionDate) ?? new Date(),
  };
}

const populate = { path: "classId", select: "name section academicYear" } as const;

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
    const item = await Student.create(toPayload(data));
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
};
