/**
 * Attendance sheets (upsert by class + calendar date).
 */
import { dbConnect } from "@/backend/config/database";
import { Attendance } from "@/backend/models/Attendance";
import { Student } from "@/backend/models/Student";
import { ClassModel } from "@/backend/models/Class";
import { ServiceError } from "@/backend/types";
import type { AttendanceInput } from "@/backend/validators/attendance.validator";

function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new ServiceError("VALIDATION", "Invalid attendance date", 400);
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new ServiceError("VALIDATION", "Invalid attendance date", 400);
  }
  return date;
}

export const attendanceService = {
  async list(filters: { classId?: string | null; classIds?: string[]; date?: string | null; page?: number; pageSize?: number }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.classId) query.classId = filters.classId;
    else if (filters.classIds) query.classId = { $in: filters.classIds };
    if (filters.date) {
      const d = calendarDate(filters.date);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      query.date = { $gte: d, $lt: next };
    }

    const total = await Attendance.countDocuments(query);
    const pageSize = filters.pageSize || 50;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(filters.page || 1, pageCount);
    const attendance = await Attendance.find(query)
      .populate("classId", "name section")
      .populate("records.studentId", "firstName lastName admissionNo rollNumber")
      .sort({ date: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean();
    return { attendance, pagination: { page, pageSize, total, pageCount } };
  },

  async upsert(data: AttendanceInput, takenBy?: string) {
    await dbConnect();
    const cls = await ClassModel.findById(data.classId).select("_id").lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);

    const studentIds = [...new Set(data.records.map((record) => record.studentId))];
    if (studentIds.length !== data.records.length) {
      throw new ServiceError("VALIDATION", "A student can appear only once on an attendance sheet", 400);
    }
    if (studentIds.length) {
      const validCount = await Student.countDocuments({ _id: { $in: studentIds }, classId: data.classId });
      if (validCount !== studentIds.length) {
        throw new ServiceError("VALIDATION", "Attendance contains a student who is not enrolled in the selected class", 400);
      }
    }

    const date = calendarDate(data.date);
    return Attendance.findOneAndUpdate(
      { classId: data.classId, date },
      {
        classId: data.classId,
        date,
        records: data.records,
        takenBy: takenBy || undefined,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate("classId", "name section")
      .populate("records.studentId", "firstName lastName admissionNo rollNumber");
  },
};
