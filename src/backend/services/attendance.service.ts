/**
 * Attendance sheets (upsert by class + date).
 */
import { dbConnect } from "@/backend/config/database";
import { Attendance } from "@/backend/models/Attendance";
import type { AttendanceInput } from "@/backend/validators/attendance.validator";

export const attendanceService = {
  async list(filters: { classId?: string | null; date?: string | null }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.classId) query.classId = filters.classId;
    if (filters.date) {
      const d = new Date(filters.date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      query.date = { $gte: d, $lt: next };
    }

    return Attendance.find(query)
      .populate("classId", "name section")
      .populate("records.studentId", "firstName lastName admissionNo rollNumber")
      .sort({ date: -1 })
      .limit(50)
      .lean();
  },

  async upsert(data: AttendanceInput, takenBy?: string) {
    await dbConnect();
    const date = new Date(data.date);
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
