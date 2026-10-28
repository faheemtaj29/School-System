/**
 * Attendance sheets (upsert by class + date).
 */
import { dbConnect } from "@/backend/config/database";
import { Attendance } from "@/backend/models/Attendance";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { teacherService } from "@/backend/services/teacher.service";
import { ServiceError, type SessionUser } from "@/backend/types";
import type { AttendanceInput } from "@/backend/validators/attendance.validator";

export const attendanceService = {
  async overview(
    filters: { date?: string | null; branchCode?: string | null },
    session: SessionUser
  ) {
    await dbConnect();
    const dateValue = filters.date || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      throw new ServiceError("VALIDATION", "Enter a valid attendance date", 400);
    }
    const date = new Date(`${dateValue}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateValue) {
      throw new ServiceError("VALIDATION", "Enter a valid attendance date", 400);
    }
    const nextDate = new Date(date);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const branchCode = filters.branchCode?.trim().toUpperCase();
    const assignedClasses = session.role === "teacher"
      ? await teacherService.assignedClasses(session)
      : null;
    const classes = (assignedClasses
      ? assignedClasses.filter((item) => !branchCode || item.branchCode === branchCode)
      : await ClassModel.find(branchCode ? { branchCode } : {})
          .populate("classTeacher", "firstName lastName employeeId")
          .sort({ level: 1, name: 1, section: 1 })
          .lean());
    const classIds = classes.map((item) => item._id);
    const [studentCounts, sheets] = classIds.length
      ? await Promise.all([
          Student.aggregate([
            { $match: { classId: { $in: classIds }, status: "active" } },
            {
              $group: {
                _id: "$classId",
                count: { $sum: 1 },
                studentIds: { $push: "$_id" },
              },
            },
          ]),
          Attendance.find({
            classId: { $in: classIds },
            date: { $gte: date, $lt: nextDate },
          })
            .populate("classId", "name section branchCode")
            .populate("takenBy", "name")
            .lean(),
        ])
      : [[], []];
    const countByClass = new Map(
      (studentCounts as { _id: unknown; count: number; studentIds: unknown[] }[]).map((item) => [
        String(item._id),
        { count: item.count, studentIds: item.studentIds.map(String) },
      ])
    );
    const sheetByClass = new Map(
      sheets.map((sheet) => [String(sheet.classId?._id ?? sheet.classId), sheet])
    );
    const classRows = classes.map((item) => {
      const id = String(item._id);
      const sheet = sheetByClass.get(id);
      const records = sheet?.records || [];
      const rosterIds = new Set(countByClass.get(id)?.studentIds || []);
      const recordedStudents = new Set<string>();
      const counts = { present: 0, absent: 0, late: 0, excused: 0 };
      for (const record of records) {
        const studentId = String(record.studentId);
        if (!rosterIds.has(studentId) || recordedStudents.has(studentId)) continue;
        recordedStudents.add(studentId);
        if (record.status === "present") counts.present += 1;
        else if (record.status === "absent") counts.absent += 1;
        else if (record.status === "late") counts.late += 1;
        else if (record.status === "excused") counts.excused += 1;
      }
      const enrolled = countByClass.get(id)?.count || 0;
      return {
        _id: id,
        name: item.name,
        section: item.section,
        branchCode: item.branchCode || "",
        enrolled,
        marked: recordedStudents.size,
        pending: Math.max(enrolled - recordedStudents.size, 0),
        status: enrolled === 0
          ? "no-students"
          : !sheet
            ? "pending"
            : records.length < enrolled
              ? "incomplete"
              : "saved",
        counts,
      };
    });
    const totals = classRows.reduce(
      (result, item) => {
        result.enrolled += item.enrolled;
        result.pending += item.pending;
        result.present += item.counts.present;
        result.absent += item.counts.absent;
        result.late += item.counts.late;
        result.excused += item.counts.excused;
        return result;
      },
      { enrolled: 0, pending: 0, present: 0, absent: 0, late: 0, excused: 0 }
    );
    return {
      role: session.role,
      date: dateValue,
      branchCode: branchCode || "",
      totals: {
        ...totals,
        pendingClasses: classRows.filter(
          (item) => item.enrolled > 0 && item.status !== "saved"
        ).length,
        classes: classRows.length,
      },
      classes: classRows,
      sheets: sheets.map((sheet) => ({
        ...sheet,
        teacherName:
          typeof sheet.takenBy === "object" && sheet.takenBy
            ? sheet.takenBy.name || ""
            : "",
      })),
    };
  },

  async list(
    filters: { classId?: string | null; date?: string | null },
    session: SessionUser
  ) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (session.role === "teacher") {
      const classes = await teacherService.assignedClasses(session);
      const classIds = classes.map((item) => String(item._id));
      if (filters.classId && !classIds.includes(filters.classId)) {
        throw new ServiceError("FORBIDDEN", "This class is not assigned to your teacher account", 403);
      }
      query.classId = filters.classId || { $in: classIds };
    } else if (filters.classId) {
      query.classId = filters.classId;
    }
    if (filters.date) {
      const d = new Date(filters.date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      query.date = { $gte: d, $lt: next };
    }

    return Attendance.find(query)
      .populate("classId", "name section")
      .populate("records.studentId", "firstName lastName admissionNo rollNumber")
      .populate("takenBy", "name")
      .sort({ date: -1 })
      .limit(50)
      .lean();
  },

  async upsert(data: AttendanceInput, session: SessionUser) {
    await dbConnect();
    if (session.role === "teacher") await teacherService.assertClassAssigned(session, data.classId);
    const date = new Date(`${data.date.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new ServiceError("VALIDATION", "Enter a valid attendance date", 400);
    }
    const studentIds = data.records.map((record) => record.studentId);
    if (new Set(studentIds).size !== studentIds.length) {
      throw new ServiceError("VALIDATION", "Attendance contains a duplicate student", 400);
    }
    const enrolledCount = await Student.countDocuments({
      _id: { $in: studentIds },
      classId: data.classId,
      status: "active",
    });
    if (enrolledCount !== studentIds.length) {
      throw new ServiceError("VALIDATION", "Every student must belong to the selected class", 400);
    }
    return Attendance.findOneAndUpdate(
      { classId: data.classId, date },
      {
        classId: data.classId,
        date,
        records: data.records,
        takenBy: session.id,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate("classId", "name section")
      .populate("records.studentId", "firstName lastName admissionNo rollNumber");
  },
};
