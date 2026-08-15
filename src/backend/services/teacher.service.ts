/**
 * Teacher CRUD with related subjects + classes.
 */
import { dbConnect } from "@/backend/config/database";
import { Teacher } from "@/backend/models/Teacher";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { TeacherInput } from "@/backend/validators/teacher.validator";

function toPayload(data: TeacherInput) {
  return {
    ...data,
    branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    dateOfBirth: parseOptionalDate(data.dateOfBirth),
    joinDate: parseOptionalDate(data.joinDate),
  };
}

async function populated(id: string) {
  return Teacher.findById(id)
    .populate("subjects", "name code")
    .populate("classes", "name section")
    .lean();
}

export const teacherService = {
  async list(branchCode?: string | null) {
    await dbConnect();
    const filter = branchCode ? { branchCode: branchCode.toUpperCase() } : {};
    return Teacher.find(filter)
      .populate("subjects", "name code")
      .populate("classes", "name section")
      .sort({ firstName: 1 })
      .lean();
  },

  async getById(id: string) {
    await dbConnect();
    const item = await populated(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    return item;
  },

  async create(data: TeacherInput) {
    await dbConnect();
    const item = await Teacher.create(toPayload(data));
    return populated(String(item._id));
  },

  async update(id: string, data: TeacherInput) {
    await dbConnect();
    const item = await Teacher.findByIdAndUpdate(id, toPayload(data), { new: true })
      .populate("subjects", "name code")
      .populate("classes", "name section");
    if (!item) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Teacher.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    return { ok: true };
  },
};
