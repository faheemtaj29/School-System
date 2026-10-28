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
import { ExamSchedule } from "@/backend/models/ExamWorkflow";
import { TimetableSlot } from "@/backend/models/CampusModules";
import { teacherService } from "@/backend/services/teacher.service";
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

type ScheduleRef = { _id?: unknown; name?: string; section?: string; key?: string } | string;
type TeacherScheduleRow = {
  subjectId: ScheduleRef;
  examDate?: Date;
  startTime?: string;
  endTime?: string;
  totalMarks: number;
  room?: string;
  status: "draft" | "published";
};
type TeacherSchedule = {
  _id: unknown;
  classId: ScheduleRef;
  termId?: ScheduleRef;
  examTypeId?: ScheduleRef;
  academicYear: string;
  rows: TeacherScheduleRow[];
};

function refValue(value: ScheduleRef | null | undefined) {
  return value && typeof value === "object" ? value : {};
}

function refId(value: ScheduleRef) {
  const ref = refValue(value);
  return ref._id ?? value;
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
    const assignedClasses = await teacherService.assignedClasses(session);
    const classIds = assignedClasses.map((c) => c._id);
    const subjectsByClass = new Map(
      assignedClasses.map((item) => [
        String(item._id),
        new Set((item.subjects || []).map((subject: { _id: unknown }) => String(subject._id))),
      ])
    );
    const subjectIds = [...new Set([...subjectsByClass.values()].flatMap((ids) => [...ids]))];
    const monthAgo = new Date(start);
    monthAgo.setDate(monthAgo.getDate() - 29);

    const [
      students,
      todaySheets,
      monthSheets,
      schedules,
      timetable,
      attendanceActivity,
      marksActivity,
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
      ExamSchedule.find({ classId: { $in: classIds }, status: "published" })
        .populate("termId", "name academicYear")
        .populate("examTypeId", "key name")
        .populate("classId", "name section")
        .populate("rows.subjectId", "name code")
        .sort({ updatedAt: -1 })
        .lean(),
      TimetableSlot.find({ teacherId: teacher._id, day: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()] })
        .populate("classId", "name section")
        .populate("subjectId", "name code")
        .sort({ period: 1 })
        .lean(),
      Attendance.find({ classId: { $in: classIds } })
        .populate("classId", "name section")
        .sort({ date: -1, updatedAt: -1 })
        .limit(4)
        .lean(),
      Exam.find({
        classId: { $in: classIds },
        subjectId: { $in: subjectIds },
      })
        .populate("classId", "name section")
        .populate("subjectId", "name code")
        .sort({ updatedAt: -1 })
        .limit(5)
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
      Notice.find({
        publishDate: { $lte: new Date() },
        $and: [
          { $or: [{ expiryDate: null }, { expiryDate: { $gte: new Date() } }] },
          {
            $or: [
              { audience: { $in: ["all", "staff"] } },
              { audience: "class", classId: { $in: classIds } },
            ],
          },
        ],
      }).sort({ publishDate: -1 }).limit(4).lean(),
    ]);

    const markedClassIds = new Set(todaySheets.map((s) => String(s.classId?._id ?? s.classId)));
    const assignedMarksActivity = marksActivity.filter(
      (activity: { classId: ScheduleRef; subjectId: ScheduleRef }) =>
        subjectsByClass.get(String(refId(activity.classId)))
          ?.has(String(refId(activity.subjectId)))
    );
    const pendingClasses =     assignedClasses.filter(
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

    const classRosterCounts = new Map(
      await Student.aggregate([
        { $match: { classId: { $in: classIds }, status: "active" } },
        { $group: { _id: "$classId", count: { $sum: 1 } } },
      ]).then((rows: { _id: unknown; count: number }[]) =>
        rows.map((row) => [String(row._id), row.count] as const)
      )
    );
    const teacherSchedules = schedules as TeacherSchedule[];
    const scheduleTasks = teacherSchedules.flatMap((schedule: TeacherSchedule) => {
      const classRef = refValue(schedule.classId);
      const classId = String(refId(schedule.classId));
      const className = classRef?.name
        ? `${classRef.name} - ${classRef.section || ""}`.trim()
        : "Class";
      const rosterCount = classRosterCounts.get(classId) || 0;
      return schedule.rows
        .filter((row: TeacherScheduleRow) => row.status === "published" && row.examDate && row.examDate <= end)
        .filter((row: TeacherScheduleRow) =>
          subjectsByClass.get(classId)?.has(String(refId(row.subjectId)))
        )
        .map((row: TeacherScheduleRow) => {
          const subject = refValue(row.subjectId);
          return { schedule, row, classId, className, rosterCount, subject };
        });
    });
    const taskRows = await Promise.all(scheduleTasks.map(async (task) => {
      const exam = await Exam.findOne({
        $or: [
          { scheduleId: task.schedule._id, subjectId: task.subject._id ?? task.subject },
          {
            classId: task.classId,
            subjectId: task.subject._id ?? task.subject,
            date: task.row.examDate,
          },
        ],
      }).select("results").lean();
      const resultCount = new Set((exam?.results || []).map((result: { studentId: unknown }) => String(result.studentId))).size;
      const missingMarks = Math.max(task.rosterCount - resultCount, 0);
      return {
        scheduleId: String(task.schedule._id),
        classId: task.classId,
        className: task.className,
        subjectId: String(refId(task.subject as ScheduleRef)),
        subjectName: task.subject.name || "Subject",
        date: task.row.examDate,
        maxMarks: task.row.totalMarks,
        missingMarks,
        students: task.rosterCount,
        examType: refValue(task.schedule.examTypeId)?.key || "final",
        termLabel: refValue(task.schedule.termId)?.name || "",
        academicYear: task.schedule.academicYear,
      };
    }));
    const pendingMarks = taskRows.filter((task) => task.missingMarks > 0).slice(0, 8);
    const upcomingExams = teacherSchedules.flatMap((schedule: TeacherSchedule) => {
      const classRef = refValue(schedule.classId);
      return schedule.rows
        .filter((row: TeacherScheduleRow) => row.status === "published" && row.examDate && row.examDate >= start)
        .filter((row: TeacherScheduleRow) =>
          subjectsByClass.get(String(refId(schedule.classId) ?? schedule.classId))
            ?.has(String(refId(row.subjectId)))
        )
        .map((row: TeacherScheduleRow) => ({
          _id: `${String(schedule._id)}-${String(refId(row.subjectId))}`,
          scheduleId: String(schedule._id),
          date: row.examDate,
          title: refValue(row.subjectId).name || "Examination",
          startTime: row.startTime || "",
          endTime: row.endTime || "",
          maxMarks: row.totalMarks,
          room: row.room || "",
          classId: { name: classRef.name || "Class", section: classRef.section || "" },
          subjectId: row.subjectId,
          examType: refValue(schedule.examTypeId).name || "",
          term: refValue(schedule.termId).name || "",
        }));
    }).sort((a, b) =>
      new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    ).slice(0, 6);

    return {
      role: "teacher" as const,
      linked: true,
      profile: {
        name: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.employeeId,
        qualification: teacher.qualification || "",
        designation: teacher.designation || "",
        department: teacher.department || "",
        branchCode: teacher.branchCode || "",
      },
      stats: {
        classes: classIds.length,
        subjects: subjectIds.length,
        students,
        courses: courses.length,
        attendanceRate: rate(present, marked),
        pendingAttendance: pendingClasses.length,
        pendingMarks: pendingMarks.length,
      },
      classes: assignedClasses.map((c: { _id: unknown; name: string; section: string; room?: string; subjects?: { _id: unknown; name: string; code?: string }[] }) => ({
        _id: String(c._id),
        name: c.name,
        section: c.section,
        room: c.room || "",
        subjects: (c.subjects || []).map((s: { _id: unknown; name: string; code?: string }) => ({
          _id: String(s._id),
          name: s.name,
          code: s.code,
        })),
        markedToday: markedClassIds.has(String(c._id)),
      })),
      subjects: teacher.subjects || [],
      timetable,
      pendingMarks,
      upcomingExams,
      attendanceActivity,
      marksActivity: assignedMarksActivity,
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

    const [sheets, fees, feeTotals, exams, enrollments, diplomas, notices] = await Promise.all([
      Attendance.find({
        classId: student.classId?._id ?? student.classId,
        date: { $gte: monthAgo, $lt: end },
      })
        .sort({ date: -1 })
        .lean(),
      Fee.find({ studentId: student._id }).sort({ dueDate: -1 }).limit(8).lean(),
      Fee.aggregate([
        { $match: { studentId: student._id } },
        {
          $group: {
            _id: null,
            billed: { $sum: "$amount" },
            paid: { $sum: "$paidAmount" },
            overdue: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "overdue"] },
                  { $max: [{ $subtract: ["$amount", "$paidAmount"] }, 0] },
                  0,
                ],
              },
            },
            fineAmount: {
              $sum: {
                $cond: [
                  "$lateFeeApplied",
                  { $ifNull: ["$lateFeeAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
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

    const feeSummary = feeTotals[0] || { billed: 0, paid: 0, overdue: 0, fineAmount: 0 };
    const billed = feeSummary.billed;
    const paid = feeSummary.paid;
    const overdue = feeSummary.overdue;

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
        fineAmount: feeSummary.fineAmount,
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
