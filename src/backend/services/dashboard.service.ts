/**
 * Dashboard aggregates — one admin overview plus personal views for
 * teachers and students, each scoped to the records they own.
 */
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { Subject } from "@/backend/models/Subject";
import { Fee } from "@/backend/models/Fee";
import { Exam } from "@/backend/models/Exam";
import { Attendance } from "@/backend/models/Attendance";
import { Course, Diploma, Enrollment, Lecture } from "@/backend/models/ELearning";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { Notice } from "@/backend/models/Notice";
import type { SessionUser } from "@/backend/types";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function rate(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export const dashboardService = {
  async getOverview() {
    await dbConnect();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const [students, teachers, classes, subjects, exams] = await Promise.all([
      Student.countDocuments({ status: "active" }),
      Teacher.countDocuments({ status: "active" }),
      ClassModel.countDocuments(),
      Subject.countDocuments(),
      Exam.countDocuments(),
    ]);

    const feeAgg = await Fee.aggregate([
      {
        $group: {
          _id: null,
          billed: { $sum: "$amount" },
          collected: { $sum: "$paidAmount" },
          overdue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "overdue"] },
                { $subtract: ["$amount", "$paidAmount"] },
                0,
              ],
            },
          },
          overdueCount: {
            $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] },
          },
        },
      },
    ]);

    const fees = feeAgg[0] ?? { billed: 0, collected: 0, overdue: 0, overdueCount: 0 };
    const pending = Math.max(fees.billed - fees.collected - fees.overdue, 0);

    const todaySheets = await Attendance.find({
      date: { $gte: startOfToday, $lt: endOfToday },
    }).lean();

    let marked = 0;
    let present = 0;
    for (const sheet of todaySheets) {
      for (const record of sheet.records ?? []) {
        marked += 1;
        if (record.status === "present") present += 1;
      }
    }

    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 6);

    const [upcomingExams, recentStudents, recentFees, weekSheets, classCounts] =
      await Promise.all([
        Exam.find({ date: { $gte: startOfToday } })
          .sort({ date: 1 })
          .limit(4)
          .populate("classId", "name section")
          .populate("subjectId", "name code")
          .lean(),
        Student.find()
          .sort({ createdAt: -1 })
          .limit(5)
          .populate("classId", "name section")
          .lean(),
        Fee.find()
          .sort({ createdAt: -1 })
          .limit(4)
          .populate({
            path: "studentId",
            select: "firstName lastName admissionNo classId",
            populate: { path: "classId", select: "name section" },
          })
          .lean(),
        Attendance.find({ date: { $gte: weekAgo, $lt: endOfToday } }).lean(),
        Student.aggregate([
          {
            $lookup: {
              from: "classes",
              localField: "classId",
              foreignField: "_id",
              as: "class",
            },
          },
          { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
          {
            $group: {
              _id: "$classId",
              label: {
                $first: {
                  $concat: [
                    { $ifNull: ["$class.name", "?"] },
                    "-",
                    { $ifNull: ["$class.section", "?"] },
                  ],
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 8 },
        ]),
      ]);

    // Build 7-day attendance trend
    const dayMap = new Map<string, { present: number; total: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { present: 0, total: 0 });
    }
    for (const sheet of weekSheets) {
      const key = new Date(sheet.date).toISOString().slice(0, 10);
      const bucket = dayMap.get(key);
      if (!bucket) continue;
      for (const r of sheet.records ?? []) {
        bucket.total += 1;
        if (r.status === "present") bucket.present += 1;
      }
    }
    const attendanceTrend = [...dayMap.entries()].map(([date, v]) => ({
      date,
      label: new Date(date).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase(),
      rate: v.total ? Math.round((v.present / v.total) * 100) : 0,
      present: v.present,
      total: v.total,
    }));

    const avgAttendance = attendanceTrend.length
      ? Math.round(
          attendanceTrend.reduce((s, d) => s + d.rate, 0) /
            Math.max(attendanceTrend.filter((d) => d.total > 0).length, 1)
        )
      : 0;

    return {
      stats: {
        students,
        teachers,
        classes,
        subjects,
        exams,
        upcomingExamCount: upcomingExams.length,
        attendanceToday: marked ? Math.round((present / marked) * 100) : null,
        fees: {
          billed: fees.billed,
          collected: fees.collected,
          pending,
          overdue: fees.overdue,
          overdueCount: fees.overdueCount,
        },
      },
      charts: {
        attendanceTrend,
        avgAttendance,
        classStrength: classCounts.map((c) => ({
          label: c.label,
          count: c.count,
        })),
      },
      upcomingExams,
      recentStudents,
      recentFees,
    };
  },

  /** Everything a teacher needs for their own classes, courses and payslips. */
  async getTeacherOverview(session: SessionUser) {
    await dbConnect();
    const teacher = await Teacher.findOne({
      $or: [{ user: session.id }, { email: session.email.toLowerCase() }],
    })
      .populate("classes", "name section room")
      .populate("subjects", "name code")
      .lean();

    if (!teacher) return { role: "teacher" as const, linked: false };

    const { start, end } = todayRange();
    const classIds = (teacher.classes || []).map((c: { _id: unknown }) => c._id);
    const subjectIds = (teacher.subjects || []).map((s: { _id: unknown }) => s._id);
    const monthAgo = new Date(start);
    monthAgo.setDate(monthAgo.getDate() - 29);

    const [
      students,
      todaySheets,
      monthSheets,
      upcomingExams,
      courses,
      lectures,
      payslips,
      leaves,
      notices,
    ] = await Promise.all([
      Student.countDocuments({ classId: { $in: classIds }, status: "active" }),
      Attendance.find({ classId: { $in: classIds }, date: { $gte: start, $lt: end } })
        .populate("classId", "name section")
        .lean(),
      Attendance.find({ classId: { $in: classIds }, date: { $gte: monthAgo, $lt: end } }).lean(),
      Exam.find({
        date: { $gte: start },
        $or: [{ teacherId: teacher._id }, { classId: { $in: classIds } }, { subjectId: { $in: subjectIds } }],
      })
        .sort({ date: 1 })
        .limit(6)
        .populate("classId", "name section")
        .populate("subjectId", "name code")
        .lean(),
      Course.find({ teacherId: teacher._id }).sort({ startDate: -1 }).limit(8).lean(),
      Lecture.find({
        $or: [{ teacherId: teacher._id }],
        scheduledAt: { $gte: start },
        status: { $in: ["scheduled", "live"] },
      })
        .sort({ scheduledAt: 1 })
        .limit(6)
        .populate("courseId", "code title")
        .lean(),
      Payslip.find({ teacherId: teacher._id }).sort({ createdAt: -1 }).limit(4).lean(),
      LeaveRequest.find({ teacherId: teacher._id }).sort({ createdAt: -1 }).limit(4).lean(),
      Notice.find().sort({ createdAt: -1 }).limit(4).lean(),
    ]);

    const markedClassIds = new Set(todaySheets.map((s) => String(s.classId?._id ?? s.classId)));
    const pendingClasses = (teacher.classes || []).filter(
      (c: { _id: unknown }) => !markedClassIds.has(String(c._id))
    );

    let present = 0;
    let marked = 0;
    for (const sheet of monthSheets) {
      for (const record of sheet.records ?? []) {
        marked += 1;
        if (record.status === "present") present += 1;
      }
    }

    const courseIds = courses.map((c) => c._id);
    const enrollments = courseIds.length
      ? await Enrollment.aggregate([
          { $match: { courseId: { $in: courseIds }, status: { $ne: "dropped" } } },
          { $group: { _id: "$courseId", learners: { $sum: 1 }, progress: { $avg: "$progress" } } },
        ])
      : [];
    const enrollMap = new Map(enrollments.map((e) => [String(e._id), e]));

    return {
      role: "teacher" as const,
      linked: true,
      profile: {
        name: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.employeeId,
        qualification: teacher.qualification || "",
        branchCode: teacher.branchCode || "",
      },
      stats: {
        classes: classIds.length,
        subjects: subjectIds.length,
        students,
        courses: courses.length,
        attendanceRate: rate(present, marked),
        pendingAttendance: pendingClasses.length,
      },
      classes: (teacher.classes || []).map((c: { _id: unknown; name: string; section: string; room?: string }) => ({
        _id: String(c._id),
        name: c.name,
        section: c.section,
        room: c.room || "",
        markedToday: markedClassIds.has(String(c._id)),
      })),
      subjects: teacher.subjects || [],
      upcomingExams,
      courses: courses.map((c) => ({
        ...c,
        learners: enrollMap.get(String(c._id))?.learners ?? 0,
        avgProgress: Math.round(enrollMap.get(String(c._id))?.progress ?? 0),
      })),
      lectures,
      payslips,
      leaves,
      notices,
    };
  },

  /** A student's own attendance, fees, results, courses and certificates. */
  async getStudentOverview(session: SessionUser) {
    await dbConnect();
    const student = await Student.findOne({
      $or: [{ user: session.id }, { email: session.email.toLowerCase() }],
    })
      .populate("classId", "name section room")
      .lean();

    if (!student) return { role: "student" as const, linked: false };

    const { start, end } = todayRange();
    const monthAgo = new Date(start);
    monthAgo.setDate(monthAgo.getDate() - 29);

    const [sheets, fees, exams, enrollments, diplomas, notices] = await Promise.all([
      Attendance.find({
        classId: student.classId?._id ?? student.classId,
        date: { $gte: monthAgo, $lt: end },
      })
        .sort({ date: -1 })
        .lean(),
      Fee.find({ studentId: student._id }).sort({ dueDate: -1 }).limit(8).lean(),
      Exam.find({ "results.studentId": student._id })
        .sort({ date: -1 })
        .limit(6)
        .populate("subjectId", "name code")
        .lean(),
      Enrollment.find({ studentId: student._id })
        .sort({ enrolledAt: -1 })
        .populate("courseId", "code title mode level status startDate liveLink")
        .lean(),
      Diploma.find({ studentId: student._id, status: "issued" })
        .sort({ issueDate: -1 })
        .populate("courseId", "code title")
        .lean(),
      Notice.find().sort({ createdAt: -1 }).limit(4).lean(),
    ]);

    let present = 0;
    let marked = 0;
    let todayStatus: string | null = null;
    const history: { date: string; status: string }[] = [];
    for (const sheet of sheets) {
      const mine = (sheet.records ?? []).find(
        (r: { studentId: unknown }) => String(r.studentId) === String(student._id)
      );
      if (!mine) continue;
      marked += 1;
      if (mine.status === "present") present += 1;
      if (new Date(sheet.date) >= start) todayStatus = mine.status;
      if (history.length < 10) history.push({ date: sheet.date, status: mine.status });
    }

    const billed = fees.reduce((sum, f) => sum + f.amount, 0);
    const paid = fees.reduce((sum, f) => sum + f.paidAmount, 0);
    const overdue = fees
      .filter((f) => f.status === "overdue")
      .reduce((sum, f) => sum + (f.amount - f.paidAmount), 0);

    const results = exams.map((exam) => {
      const mine = (exam.results ?? []).find(
        (r: { studentId: unknown }) => String(r.studentId) === String(student._id)
      );
      return {
        _id: String(exam._id),
        title: exam.title,
        examType: exam.examType,
        date: exam.date,
        subject: exam.subjectId,
        maxMarks: exam.maxMarks,
        marks: mine?.marks ?? null,
        grade: mine?.grade ?? "",
        percent: mine ? rate(mine.marks, exam.maxMarks) : 0,
      };
    });
    const scored = results.filter((r) => r.marks != null);

    const courseIds = enrollments
      .map((e) => e.courseId?._id ?? e.courseId)
      .filter(Boolean);
    const lectures = courseIds.length
      ? await Lecture.find({
          courseId: { $in: courseIds },
          $or: [{ scheduledAt: { $gte: start } }, { type: "recorded" }],
          status: { $ne: "cancelled" },
        })
          .sort({ scheduledAt: 1, order: 1 })
          .limit(8)
          .populate("courseId", "code title")
          .lean()
      : [];

    return {
      role: "student" as const,
      linked: true,
      profile: {
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        rollNumber: student.rollNumber || "",
        className: student.classId
          ? `${student.classId.name} - ${student.classId.section}`
          : "Unassigned",
        branchCode: student.branchCode || "",
      },
      stats: {
        attendanceRate: rate(present, marked),
        presentDays: present,
        markedDays: marked,
        todayStatus,
        billed,
        paid,
        due: Math.max(billed - paid, 0),
        overdue,
        courses: enrollments.length,
        diplomas: diplomas.length,
        avgScore: scored.length
          ? Math.round(scored.reduce((s, r) => s + r.percent, 0) / scored.length)
          : 0,
      },
      attendanceHistory: history,
      fees,
      results,
      enrollments,
      lectures,
      diplomas,
      notices,
    };
  },

  async forSession(session: SessionUser) {
    if (session.role === "teacher") return this.getTeacherOverview(session);
    if (session.role === "student" || session.role === "parent") {
      return this.getStudentOverview(session);
    }
    if (session.role === "staff") {
      return {
        role: "staff" as const,
        linked: true,
        ...(await this.getOverview()),
      };
    }
    return { role: "admin" as const, linked: true, ...(await this.getOverview()) };
  },
};
