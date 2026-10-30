/**
 * Exam Center — the bulk exam workflow:
 *   1. Date sheet: pick classes, their subjects are spread over working days in one click.
 *   2. Roll number slips: issue exam roll numbers and print slips with paper times.
 *   3. Marks entry: component-wise marks (theory / practical / viva / assignment …).
 *   4. Result cards: totals, grades, GPA, class position — for many classes at once.
 */
import { photoUrl } from "@/backend/lib/images";
import { letterheads, type Letterhead } from "@/backend/lib/letterhead";
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Exam } from "@/backend/models/Exam";
import {
  ExamMark,
  ExamSchedule,
  ExamTerm,
  type IMarksComponent,
} from "@/backend/models/ExamWorkflow";
import { Settings } from "@/backend/models/Settings";
import { Student } from "@/backend/models/Student";
import { gpaPoints, gradeOf, remarkOf } from "@/backend/lib/grading";
import { ServiceError, type SessionUser } from "@/backend/types";
import { resolveTeacher } from "@/backend/lib/portal";
import { validateRows } from "@/backend/services/examWorkflow.service";
import type {
  DateSheetPlanInput,
  DateSheetSaveInput,
  MarksSaveInput,
  RollNumberInput,
  StudentMarksSaveInput,
} from "@/backend/validators/examWorkflow.validator";

type ClassLean = {
  _id: Types.ObjectId;
  name: string;
  section: string;
  academicYear?: string;
  level?: number;
  subjects?: { _id: Types.ObjectId; name: string; code: string; credits?: number }[];
};

type StudentLean = {
  _id: Types.ObjectId;
  firstName: string;
  lastName: string;
  admissionNo: string;
  rollNumber?: string;
  parentName?: string;
  classId: Types.ObjectId;
  photoUpdatedAt?: Date;
  dateOfBirth?: Date;
};

type ScheduleRowLean = {
  subjectId: { _id: Types.ObjectId; name: string; code: string; credits?: number } | Types.ObjectId;
  examDate?: Date;
  startTime?: string;
  endTime?: string;
  totalMarks: number;
  passingMarks: number;
  room?: string;
  components?: IMarksComponent[];
};

type RollLean = { studentId: Types.ObjectId; rollNo: string };

type MarkLean = {
  _id: Types.ObjectId;
  studentId: Types.ObjectId;
  subjectId: Types.ObjectId;
  marks: { key: string; obtained: number }[];
  total: number;
  absent: boolean;
  remarks?: string;
  history?: { at: Date; byName?: string; before: Snap; after: Snap; reason?: string }[];
};

/**
 * Which papers a person may enter marks for. Admin: all. A class teacher: every paper of their
 * class (so one teacher can prepare the whole class result). A subject teacher: their subjects in
 * their classes. null means no limit.
 */
export type MarkScope = { classTeacherOf: Set<string>; subjects: Set<string>; classes: Set<string> } | null;

export async function markScopeFor(session: SessionUser): Promise<MarkScope> {
  if (session.role !== "teacher") return null;
  await dbConnect();
  const teacher = await resolveTeacher(session);
  if (!teacher) return { classTeacherOf: new Set(), subjects: new Set(), classes: new Set() };
  const own = await ClassModel.find({ classTeacher: teacher._id }).select("_id").lean();
  return {
    classTeacherOf: new Set(own.map((c) => String(c._id))),
    subjects: new Set((teacher.subjects || []).map(String)),
    classes: new Set((teacher.classes || []).map(String)),
  };
}

export function canMark(scope: MarkScope, classId: string, subjectId: string) {
  if (!scope) return true;
  if (scope.classTeacherOf.has(classId)) return true;
  return scope.subjects.has(subjectId) && (!scope.classes.size || scope.classes.has(classId));
}

type Snap = { total: number; absent: boolean; marks: { key: string; obtained: number }[] };
const sameMarks = (a: Snap, b: Snap) =>
  a.absent === b.absent &&
  a.total === b.total &&
  JSON.stringify([...a.marks].sort((x, y) => x.key.localeCompare(y.key))) === JSON.stringify([...b.marks].sort((x, y) => x.key.localeCompare(y.key)));

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Actor = { id?: string; name?: string };

/** The corrections of one mark, newest first, for showing next to it. */
function historyOf(m?: { history?: { at: Date; byName?: string; before: Snap; after: Snap; reason?: string }[] } | null) {
  return (m?.history || [])
    .map((h) => ({
      at: h.at,
      by: h.byName || "",
      reason: h.reason || "",
      from: h.before.absent ? "Absent" : String(h.before.total),
      to: h.after.absent ? "Absent" : String(h.after.total),
    }))
    .reverse();
}

function classLabel(cls: { name: string; section?: string }) {
  return cls.section ? `${cls.name} - ${cls.section}` : cls.name;
}

function fullName(s: { firstName: string; lastName: string }) {
  return `${s.firstName} ${s.lastName}`.trim();
}

/** Parse "YYYY-MM-DD" as a UTC calendar day so weekdays never shift with the server timezone. */
function utcDay(value: string | Date, label: string) {
  const iso = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new ServiceError("VALIDATION", `Invalid ${label}`, 400);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Natural order for roll numbers like "2", "10", "A-7". */
function compareRoll(a?: string, b?: string) {
  if (a && b) return a.localeCompare(b, undefined, { numeric: true });
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function sortStudents(students: StudentLean[], rollOf?: (s: StudentLean) => string | undefined) {
  return [...students].sort(
    (a, b) =>
      compareRoll(rollOf?.(a) ?? a.rollNumber, rollOf?.(b) ?? b.rollNumber) ||
      fullName(a).localeCompare(fullName(b))
  );
}

/** A paper with no explicit split has one component worth its total marks. */
function componentsOf(row: { components?: IMarksComponent[]; totalMarks: number }) {
  return row.components?.length
    ? row.components
    : [{ key: "total", label: "Total", maxMarks: row.totalMarks }];
}

function subjectOf(row: ScheduleRowLean) {
  const s = row.subjectId as { _id?: Types.ObjectId; name?: string; code?: string; credits?: number };
  return {
    _id: String(s?._id ?? row.subjectId),
    name: s?.name || "Subject",
    code: s?.code || "",
    credits: s?.credits && s.credits > 0 ? s.credits : 1,
  };
}

function legacyExamType(typeKey?: string | null): "quiz" | "midterm" | "final" | "assignment" {
  const key = (typeKey || "").toUpperCase();
  if (key.includes("MID")) return "midterm";
  if (key.includes("QUIZ") || key.includes("TEST")) return "quiz";
  if (key.includes("ASSIGN")) return "assignment";
  return "final";
}

async function loadTerm(termId: string) {
  const term = await ExamTerm.findById(termId).populate("examTypeId", "key name").lean();
  if (!term) throw new ServiceError("NOT_FOUND", "Exam term not found", 404);
  return term as typeof term & { examTypeId?: { _id: Types.ObjectId; key: string; name: string } };
}

async function loadSchedules(termId: string, classIds?: string[]) {
  const query: Record<string, unknown> = { termId };
  if (classIds?.length) query.classId = { $in: classIds };
  return ExamSchedule.find(query)
    .populate("classId", "name section academicYear level branchCode")
    .populate("rows.subjectId", "name code credits")
    .lean();
}

/** Admin-facing order: by level, then class name and section. */
function sortClasses<T extends { name: string; section?: string; level?: number }>(list: T[]) {
  return [...list].sort(
    (a, b) =>
      (a.level ?? 0) - (b.level ?? 0) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }) ||
      (a.section || "").localeCompare(b.section || "")
  );
}

/** The parts of a campus letterhead the exam prints use. */
function pickHead(h: Letterhead) {
  return { name: h.name, campus: h.campus, address: h.address, phone: h.phone, logoUrl: h.logoUrl };
}

export const examCenterService = {
  /**
   * Build (but don't save) a date sheet for each selected class: its subjects are placed on
   * consecutive working days between start and end date, skipping weekly off-days and holidays.
   */
  async planDateSheet(data: DateSheetPlanInput) {
    await dbConnect();
    const term = await loadTerm(data.termId);
    const start = utcDay(data.startDate, "start date");
    const end = utcDay(data.endDate, "end date");
    if (start > end) throw new ServiceError("VALIDATION", "Start date must be before end date", 400);
    if (data.startTime >= data.endTime) {
      throw new ServiceError("VALIDATION", "Paper start time must be before end time", 400);
    }
    const termStart = utcDay(term.startDate, "term start");
    const termEnd = utcDay(term.endDate, "term end");
    if (start < termStart || end > termEnd) {
      throw new ServiceError(
        "VALIDATION",
        `Dates must fall inside the term (${isoDay(termStart)} to ${isoDay(termEnd)})`,
        400
      );
    }

    const holidays = new Set(data.holidays.map((h) => h.slice(0, 10)));
    const off = new Set(data.offDays);
    const examDays: string[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (off.has(d.getUTCDay()) || holidays.has(isoDay(d))) continue;
      examDays.push(isoDay(d));
    }
    // Leave `gapDays` free working days between papers (preparation days).
    const paperDays = examDays.filter((_, i) => i % (data.gapDays + 1) === 0);

    const classes = sortClasses(
      (await ClassModel.find({ _id: { $in: data.classIds } })
        .populate("subjects", "name code credits")
        .lean()) as unknown as ClassLean[]
    );
    const existing = await ExamSchedule.find({ termId: data.termId, classId: { $in: data.classIds } })
      .select("classId")
      .lean();
    const hasSchedule = new Set(existing.map((s) => String(s.classId)));

    const totalMarks = data.components.reduce((sum, c) => sum + c.maxMarks, 0);
    const passingMarks = Math.max(1, Math.ceil((totalMarks * data.passPercent) / 100));

    const plans = classes.map((cls) => {
      const subjects = cls.subjects || [];
      const warnings: string[] = [];
      if (!subjects.length) {
        warnings.push("No subjects are mapped to this class — add them under Classes first.");
      }
      if (subjects.length > paperDays.length) {
        warnings.push(
          `${subjects.length} papers but only ${paperDays.length} exam days available — ` +
            `extend the end date or reduce gap days. Papers without a date are marked.`
        );
      }
      return {
        classId: String(cls._id),
        classLabel: classLabel(cls),
        warnings,
        replaces: hasSchedule.has(String(cls._id)),
        rows: subjects.map((subject, i) => {
          const date = paperDays[i] || "";
          return {
            subjectId: String(subject._id),
            subjectName: subject.name,
            subjectCode: subject.code,
            examDate: date,
            day: date ? DAY_NAMES[utcDay(date, "date").getUTCDay()] : "",
            startTime: data.startTime,
            endTime: data.endTime,
            components: data.components,
            totalMarks,
            passingMarks,
          };
        }),
      };
    });

    return {
      term: { _id: String(term._id), name: term.name, academicYear: term.academicYear },
      examDays: paperDays.length,
      plans,
    };
  },

  /** Save planned (or edited) date sheets — one per class, replacing any earlier one. */
  async saveDateSheets(data: DateSheetSaveInput, userId?: string) {
    await dbConnect();
    const term = await loadTerm(data.termId);
    const saved: string[] = [];
    for (const sheet of data.schedules) {
      const rows = sheet.rows.map((row) => {
        const components = row.components?.length ? row.components : [];
        const total = components.length
          ? components.reduce((sum, c) => sum + c.maxMarks, 0)
          : row.totalMarks;
        return { ...row, components, totalMarks: total, passingMarks: Math.min(row.passingMarks, total) };
      });
      try {
        validateRows(rows, { startDate: term.startDate, endDate: term.endDate });
      } catch (e) {
        const cls = await ClassModel.findById(sheet.classId).select("name section").lean();
        const label = cls ? classLabel(cls as ClassLean) : "class";
        throw new ServiceError("VALIDATION", `${label}: ${(e as Error).message}`, 400);
      }
      const payload = {
        academicYear: term.academicYear,
        termId: term._id,
        examTypeId: term.examTypeId?._id,
        classId: sheet.classId,
        status: data.status,
        publishedAt: data.status === "published" ? new Date() : undefined,
        institutionCode: term.institutionCode || "MAIN",
        updatedBy: userId || undefined,
        rows: rows.map((r) => ({
          ...r,
          examDate: r.examDate ? new Date(r.examDate) : undefined,
          invigilatorId: r.invigilatorId || undefined,
          status: data.status,
        })),
      };
      await ExamSchedule.findOneAndUpdate(
        { termId: term._id, classId: sheet.classId },
        { $set: payload, $setOnInsert: { createdBy: userId || undefined } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(sheet.classId);
    }
    return { saved: saved.length };
  },

  /** Classes that have a date sheet for this term, with paper and marks progress. */
  async termOverview(termId: string, scope: MarkScope = null) {
    await dbConnect();
    const term = await loadTerm(termId);
    const schedules = await loadSchedules(termId);
    const classIds = schedules.map((s) => (s.classId as unknown as ClassLean)._id);
    const [studentCounts, markCounts] = await Promise.all([
      Student.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { classId: { $in: classIds }, status: "active" } },
        { $group: { _id: "$classId", n: { $sum: 1 } } },
      ]),
      ExamMark.aggregate<{ _id: { c: Types.ObjectId; s: Types.ObjectId }; n: number }>([
        { $match: { termId: new Types.ObjectId(termId) } },
        { $group: { _id: { c: "$classId", s: "$subjectId" }, n: { $sum: 1 } } },
      ]),
    ]);
    const studentsBy = new Map(studentCounts.map((r) => [String(r._id), r.n]));
    const marksBySubject = new Map(markCounts.map((r) => [`${r._id.c}:${r._id.s}`, r.n]));
    const marksBy = new Map<string, number>();
    for (const r of markCounts) marksBy.set(String(r._id.c), (marksBy.get(String(r._id.c)) || 0) + r.n);
    const classes = sortClasses(
      schedules.map((s) => {
        const cls = s.classId as unknown as ClassLean;
        const students = studentsBy.get(String(cls._id)) || 0;
        const papers = s.rows.length;
        return {
          scheduleId: String(s._id),
          classId: String(cls._id),
          name: cls.name,
          section: cls.section,
          level: cls.level,
          classLabel: classLabel(cls),
          status: s.status,
          papers,
          students,
          rollNumbers: s.rollNumbers?.length || 0,
          marksEntered: marksBy.get(String(cls._id)) || 0,
          marksExpected: papers * students,
          firstPaper: (s.rows as unknown as ScheduleRowLean[]).map((r) => r.examDate).filter(Boolean).sort()[0] || null,
          subjects: (s.rows as unknown as ScheduleRowLean[]).filter((r) => canMark(scope, String(cls._id), subjectOf(r)._id)).map((r) => ({
            ...subjectOf(r),
            examDate: r.examDate,
            startTime: r.startTime,
            endTime: r.endTime,
            totalMarks: r.totalMarks,
            components: componentsOf(r),
            marksEntered: marksBySubject.get(`${cls._id}:${subjectOf(r)._id}`) || 0,
          })),
        };
      })
    );
    return {
      term: {
        _id: String(term._id),
        name: term.name,
        academicYear: term.academicYear,
        startDate: term.startDate,
        endDate: term.endDate,
        status: term.status,
      },
      // A teacher sees only the classes where they have papers to mark.
      classes: scope ? classes.filter((c) => c.subjects.length) : classes,
      limited: Boolean(scope),
    };
  },

  /** Issue exam roll numbers for the selected classes (kept on each class's date sheet). */
  async assignRollNumbers(data: RollNumberInput) {
    await dbConnect();
    const schedules = await loadSchedules(data.termId, data.classIds);
    if (!schedules.length) {
      throw new ServiceError("VALIDATION", "Create the date sheet for these classes first", 400);
    }
    const ordered = sortClasses(
      schedules.map((s) => ({ ...(s.classId as unknown as ClassLean), schedule: s }))
    );
    // Continue after the highest number already used in this term, so numbers never repeat.
    let next = data.startFrom;
    if (data.mode === "sequence" && !data.overwrite) {
      const all = await ExamSchedule.find({ termId: data.termId }).select("rollNumbers").lean();
      for (const s of all) {
        for (const r of s.rollNumbers || []) {
          const n = Number(String(r.rollNo).replace(data.prefix, ""));
          if (Number.isFinite(n) && n >= next) next = n + 1;
        }
      }
    }
    let issued = 0;
    for (const cls of ordered) {
      const students = sortStudents(
        (await Student.find({ classId: cls._id, status: "active" })
          .select("firstName lastName admissionNo rollNumber classId")
          .lean()) as unknown as StudentLean[]
      );
      const current = new Map(
        data.overwrite
          ? []
          : ((cls.schedule.rollNumbers || []) as RollLean[]).map((r) => [String(r.studentId), r.rollNo])
      );
      const rollNumbers = students.map((s, index) => {
        const kept = current.get(String(s._id));
        if (kept) return { studentId: s._id, rollNo: kept };
        issued += 1;
        const rollNo =
          data.mode === "class"
            ? `${data.prefix}${s.rollNumber || index + 1}`
            : `${data.prefix}${next++}`;
        return { studentId: s._id, rollNo };
      });
      await ExamSchedule.updateOne({ _id: cls.schedule._id }, { $set: { rollNumbers } });
    }
    return { issued, classes: ordered.length };
  },

  /** Everything needed to print roll number slips for the selected classes. */
  async rollSlips(termId: string, classIds: string[]) {
    await dbConnect();
    const term = await loadTerm(termId);
    const schedules = await loadSchedules(termId, classIds);
    const heads = await letterheads();
    const classes = sortClasses(schedules.map((s) => ({ ...(s.classId as unknown as ClassLean), s })));
    const batches = [];
    for (const cls of classes) {
      const rollBy = new Map(((cls.s.rollNumbers || []) as RollLean[]).map((r) => [String(r.studentId), r.rollNo]));
      const students = sortStudents(
        (await Student.find({ classId: cls._id, status: "active" })
          .select("firstName lastName admissionNo rollNumber parentName classId photoUpdatedAt dateOfBirth")
          .lean()) as unknown as StudentLean[],
        (s) => rollBy.get(String(s._id))
      );
      const papers = (cls.s.rows as unknown as ScheduleRowLean[])
        .map((r) => ({
          subject: subjectOf(r).name,
          code: subjectOf(r).code,
          examDate: r.examDate ? isoDay(r.examDate) : "",
          day: r.examDate ? DAY_NAMES[r.examDate.getUTCDay()] : "",
          startTime: r.startTime || "",
          endTime: r.endTime || "",
          room: r.room || "",
        }))
        .sort((a, b) => (a.examDate || "9").localeCompare(b.examDate || "9") || a.startTime.localeCompare(b.startTime));
      batches.push({
        classId: String(cls._id),
        classLabel: classLabel(cls),
        branchCode: (cls as { branchCode?: string }).branchCode || "",
        head: pickHead(heads((cls as { branchCode?: string }).branchCode)),
        papers,
        students: students.map((s) => ({
          _id: String(s._id),
          name: fullName(s),
          fatherName: s.parentName || "",
          admissionNo: s.admissionNo,
          rollNo: rollBy.get(String(s._id)) || "",
          photoUrl: photoUrl("student", s._id, s.photoUpdatedAt),
        })),
      });
    }
    return {
      // The campus letterhead of the (first) class; each batch also carries its own.
      school: pickHead(heads(batches[0]?.branchCode)),
      term: { name: term.name, academicYear: term.academicYear },
      batches,
    };
  },

  /** Marks sheet for one paper: students in roll order with any marks already saved. */
  async marksSheet(termId: string, classId: string, subjectId: string) {
    await dbConnect();
    const schedule = (await loadSchedules(termId, [classId]))[0];
    if (!schedule) throw new ServiceError("NOT_FOUND", "No date sheet for this class in the term", 404);
    const row = (schedule.rows as unknown as ScheduleRowLean[]).find(
      (r) => subjectOf(r)._id === subjectId
    );
    if (!row) throw new ServiceError("NOT_FOUND", "This subject is not on the class date sheet", 404);
    const rollBy = new Map(((schedule.rollNumbers || []) as RollLean[]).map((r) => [String(r.studentId), r.rollNo]));
    const students = sortStudents(
      (await Student.find({ classId, status: "active" })
        .select("firstName lastName admissionNo rollNumber classId")
        .lean()) as unknown as StudentLean[],
      (s) => rollBy.get(String(s._id))
    );
    const marks = (await ExamMark.find({ scheduleId: schedule._id, subjectId }).lean()) as unknown as MarkLean[];
    const markBy = new Map(marks.map((m) => [String(m.studentId), m]));
    return {
      classLabel: classLabel(schedule.classId as unknown as ClassLean),
      subject: subjectOf(row),
      examDate: row.examDate || null,
      totalMarks: row.totalMarks,
      passingMarks: row.passingMarks,
      components: componentsOf(row),
      students: students.map((s) => {
        const m = markBy.get(String(s._id));
        return {
          _id: String(s._id),
          name: fullName(s),
          admissionNo: s.admissionNo,
          rollNo: rollBy.get(String(s._id)) || s.rollNumber || "",
          marks: Object.fromEntries((m?.marks || []).map((x) => [x.key, x.obtained])),
          absent: m?.absent || false,
          remarks: m?.remarks || "",
          saved: Boolean(m),
          history: historyOf(m),
        };
      }),
      final: (await loadTerm(termId)).status === "closed",
    };
  },

  /**
   * Result preparation by student: one student's papers in the term, each with its marks split
   * (written / theory / practical / viva …), plus the class list to move between students.
   */
  async studentSheet(termId: string, classId: string, studentId?: string, scope: MarkScope = null) {
    await dbConnect();
    const schedule = (await loadSchedules(termId, [classId]))[0];
    if (!schedule) throw new ServiceError("NOT_FOUND", "No date sheet for this class in the term", 404);
    const rows = (schedule.rows as unknown as ScheduleRowLean[]).filter((r) => canMark(scope, classId, subjectOf(r)._id));
    if (!rows.length) throw new ServiceError("FORBIDDEN", "You have no papers to mark in this class", 403);
    const rollBy = new Map(((schedule.rollNumbers || []) as RollLean[]).map((r) => [String(r.studentId), r.rollNo]));
    const students = sortStudents(
      (await Student.find({ classId, status: "active" })
        .select("firstName lastName admissionNo rollNumber classId")
        .lean()) as unknown as StudentLean[],
      (s) => rollBy.get(String(s._id))
    );
    const marks = (await ExamMark.find({ scheduleId: schedule._id }).lean()) as unknown as MarkLean[];
    const papersDone = new Map<string, number>();
    for (const m of marks) papersDone.set(String(m.studentId), (papersDone.get(String(m.studentId)) || 0) + 1);
    const current = students.find((s) => String(s._id) === studentId) || students[0];
    const mine = current ? marks.filter((m) => String(m.studentId) === String(current._id)) : [];
    return {
      classLabel: classLabel(schedule.classId as unknown as ClassLean),
      papers: rows.length,
      students: students.map((s) => ({
        _id: String(s._id),
        name: fullName(s),
        admissionNo: s.admissionNo,
        rollNo: rollBy.get(String(s._id)) || s.rollNumber || "",
        done: papersDone.get(String(s._id)) || 0,
      })),
      studentId: current ? String(current._id) : null,
      subjects: current
        ? rows.map((r) => {
            const subject = subjectOf(r);
            const m = mine.find((x) => String(x.subjectId) === subject._id);
            return {
              subject,
              examDate: r.examDate || null,
              totalMarks: r.totalMarks,
              passingMarks: r.passingMarks,
              components: componentsOf(r),
              marks: Object.fromEntries((m?.marks || []).map((x) => [x.key, x.obtained])),
              absent: m?.absent || false,
              remarks: m?.remarks || "",
              saved: Boolean(m),
              history: historyOf(m),
            };
          })
        : [],
      final: (await loadTerm(termId)).status === "closed",
    };
  },

  /** Saves one student's marks in several papers; each paper is saved exactly as from its class sheet. */
  async saveStudentMarks(data: StudentMarksSaveInput, actor?: Actor, scope: MarkScope = null) {
    const blocked = data.subjects.find((s) => !canMark(scope, data.classId, s.subjectId));
    if (blocked) throw new ServiceError("FORBIDDEN", "You can enter marks only for your own subjects", 403);
    for (const s of data.subjects) {
      await this.saveMarks(
        {
          termId: data.termId,
          classId: data.classId,
          subjectId: s.subjectId,
          entries: [{ studentId: data.studentId, marks: s.marks, absent: s.absent, remarks: s.remarks }],
          reason: data.reason,
        },
        actor
      );
    }
    return { saved: data.subjects.length };
  },

  /** Finalise a term's results (changes then need a reason) or reopen it. */
  async finalise(termId: string, final: boolean) {
    await dbConnect();
    const term = await loadTerm(termId);
    await ExamTerm.updateOne({ _id: term._id }, { $set: { status: final ? "closed" : "active" } });
    return { status: final ? "closed" : "active" };
  },

  /** Every correction made to marks in the term, newest first. */
  async corrections(termId: string, scope: MarkScope = null) {
    await dbConnect();
    const marks = (await ExamMark.find({ termId, "history.0": { $exists: true } })
      .populate("studentId", "firstName lastName admissionNo")
      .populate("subjectId", "name code")
      .populate("classId", "name section")
      .lean()) as unknown as {
      classId: ClassLean;
      subjectId: { _id: Types.ObjectId; name: string; code: string };
      studentId: { firstName: string; lastName: string; admissionNo: string } | null;
      history: { at: Date; byName?: string; before: Snap; after: Snap; reason?: string }[];
    }[];
    return marks
      .filter((m) => m.classId && m.subjectId && canMark(scope, String(m.classId._id), String(m.subjectId._id)))
      .flatMap((m) =>
        m.history.map((h) => ({
          at: h.at,
          by: h.byName || "",
          reason: h.reason || "",
          student: m.studentId ? fullName(m.studentId) : "—",
          admissionNo: m.studentId?.admissionNo || "",
          classLabel: classLabel(m.classId),
          subject: m.subjectId.name,
          from: h.before.absent ? "Absent" : String(h.before.total),
          to: h.after.absent ? "Absent" : String(h.after.total),
        }))
      )
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  },

  /** Save marks for one paper (all students at once) and mirror totals to the legacy exam list. */
  async saveMarks(data: MarksSaveInput, actor?: Actor) {
    await dbConnect();
    const userId = actor?.id;
    const term = await loadTerm(data.termId);
    const schedule = (await loadSchedules(data.termId, [data.classId]))[0];
    if (!schedule) throw new ServiceError("NOT_FOUND", "No date sheet for this class in the term", 404);
    const row = (schedule.rows as unknown as ScheduleRowLean[]).find(
      (r) => subjectOf(r)._id === data.subjectId
    );
    if (!row) throw new ServiceError("NOT_FOUND", "This subject is not on the class date sheet", 404);
    const components = componentsOf(row);
    const enrolled = new Set(
      (await Student.find({ classId: data.classId }).select("_id").lean()).map((s) => String(s._id))
    );

    // Marks already entered: any change is kept in the history; once results are final it needs a reason.
    const existing = (await ExamMark.find({
      scheduleId: schedule._id,
      subjectId: data.subjectId,
      studentId: { $in: data.entries.map((e) => e.studentId) },
    })
      .select("studentId marks total absent")
      .lean()) as unknown as (Snap & { studentId: Types.ObjectId })[];
    const before = new Map(existing.map((m) => [String(m.studentId), m]));
    const final = term.status === "closed";
    const ops = data.entries.map((entry) => {
      if (!enrolled.has(entry.studentId)) {
        throw new ServiceError("VALIDATION", "A student in this sheet is not in the class", 400);
      }
      const marks = entry.absent
        ? []
        : components.map((c) => {
            const obtained = Number(entry.marks[c.key] ?? 0);
            if (obtained > c.maxMarks) {
              throw new ServiceError(
                "VALIDATION",
                `${c.label} marks cannot exceed ${c.maxMarks}`,
                400
              );
            }
            return { key: c.key, obtained };
          });
      const total = marks.reduce((sum, m) => sum + m.obtained, 0);
      const old = before.get(entry.studentId);
      const after: Snap = { total, absent: entry.absent, marks };
      const changed = old && !sameMarks({ total: old.total, absent: old.absent, marks: old.marks || [] }, after);
      if (changed && final && !data.reason) {
        throw new ServiceError("VALIDATION", "Results are final — give a reason for the correction", 400);
      }
      return {
        updateOne: {
          filter: { scheduleId: schedule._id, subjectId: data.subjectId, studentId: entry.studentId },
          update: {
            ...(changed
              ? {
                  $push: {
                    history: {
                      at: new Date(),
                      by: userId || undefined,
                      byName: actor?.name,
                      before: { total: old.total, absent: old.absent, marks: old.marks || [] },
                      after,
                      reason: data.reason || undefined,
                    },
                  },
                }
              : {}),
            $set: {
              termId: term._id,
              classId: data.classId,
              marks,
              total,
              absent: entry.absent,
              remarks: entry.remarks || undefined,
              enteredBy: userId || undefined,
            },
          },
          upsert: true,
        },
      };
    });
    await ExamMark.bulkWrite(ops as never);

    // Keep dashboard, transcripts and the old results list in step with term marks.
    const all = await ExamMark.find({ scheduleId: schedule._id, subjectId: data.subjectId, absent: false })
      .select("studentId total")
      .lean();
    const sourceKey = `term:${data.termId}:${data.classId}:${data.subjectId}`;
    await Exam.findOneAndUpdate(
      { sourceKey },
      {
        $set: {
          title: `${term.name} — ${subjectOf(row).name}`,
          examType: legacyExamType(term.examTypeId?.key),
          classId: data.classId,
          subjectId: data.subjectId,
          date: row.examDate || term.startDate,
          maxMarks: row.totalMarks,
          results: all.map((m) => ({
            studentId: m.studentId,
            marks: m.total,
            grade: gradeOf(row.totalMarks ? (m.total / row.totalMarks) * 100 : 0),
          })),
          sourceKey,
        },
      },
      { upsert: true }
    );

    return { saved: ops.length };
  },

  /** Result cards (and the class result sheet) for the selected classes. */
  async resultCards(termId: string, classIds: string[]) {
    await dbConnect();
    const term = await loadTerm(termId);
    const schedules = await loadSchedules(termId, classIds);
    const settings = await Settings.findOne().select("institutionType passPercent").lean();
    const heads = await letterheads();
    const university = ["college", "university"].includes(settings?.institutionType || "");
    const classes = sortClasses(schedules.map((s) => ({ ...(s.classId as unknown as ClassLean), s })));

    const batches = [];
    for (const cls of classes) {
      const rows = (cls.s.rows as unknown as ScheduleRowLean[])
        .map((r) => ({ ...subjectOf(r), totalMarks: r.totalMarks, passingMarks: r.passingMarks, components: componentsOf(r), examDate: r.examDate }))
        .sort((a, b) => (a.examDate?.getTime() ?? Infinity) - (b.examDate?.getTime() ?? Infinity));
      const rollBy = new Map(((cls.s.rollNumbers || []) as RollLean[]).map((r) => [String(r.studentId), r.rollNo]));
      const students = sortStudents(
        (await Student.find({ classId: cls._id, status: "active" })
          .select("firstName lastName admissionNo rollNumber parentName classId photoUpdatedAt dateOfBirth")
          .lean()) as unknown as StudentLean[],
        (s) => rollBy.get(String(s._id))
      );
      const marks = (await ExamMark.find({ scheduleId: cls.s._id }).lean()) as unknown as MarkLean[];
      const markBy = new Map(marks.map((m) => [`${m.studentId}:${m.subjectId}`, m]));

      const cards = students.map((s) => {
        let grandMax = 0;
        let grandObtained = 0;
        let creditSum = 0;
        let pointSum = 0;
        let failed = 0;
        let pending = 0;
        const subjects = rows.map((row) => {
          const m = markBy.get(`${s._id}:${row._id}`);
          const obtained = m && !m.absent ? m.total : 0;
          const percent = row.totalMarks ? (obtained / row.totalMarks) * 100 : 0;
          const status = !m ? "pending" : m.absent ? "absent" : obtained >= row.passingMarks ? "pass" : "fail";
          if (status === "pending") pending += 1;
          if (status === "fail" || status === "absent") failed += 1;
          grandMax += row.totalMarks;
          grandObtained += obtained;
          creditSum += row.credits;
          pointSum += gpaPoints(percent) * row.credits;
          return {
            subjectId: row._id,
            name: row.name,
            code: row.code,
            credits: row.credits,
            totalMarks: row.totalMarks,
            passingMarks: row.passingMarks,
            components: row.components.map((c) => ({
              key: c.key,
              label: c.label,
              maxMarks: c.maxMarks,
              obtained: m?.marks.find((x) => x.key === c.key)?.obtained ?? null,
            })),
            obtained,
            percent: Math.round(percent * 10) / 10,
            grade: status === "absent" ? "ABS" : gradeOf(percent),
            gpa: gpaPoints(percent),
            status,
          };
        });
        const percent = grandMax ? (grandObtained / grandMax) * 100 : 0;
        const passed = failed === 0 && pending === 0;
        return {
          student: {
            _id: String(s._id),
            name: fullName(s),
            fatherName: s.parentName || "",
            admissionNo: s.admissionNo,
            rollNo: rollBy.get(String(s._id)) || s.rollNumber || "",
            photoUrl: photoUrl("student", s._id, s.photoUpdatedAt),
            dateOfBirth: s.dateOfBirth ? isoDay(s.dateOfBirth) : "",
          },
          subjects,
          totalMarks: grandMax,
          obtained: Math.round(grandObtained * 10) / 10,
          percent: Math.round(percent * 100) / 100,
          grade: gradeOf(percent),
          gpa: creditSum ? Math.round((pointSum / creditSum) * 100) / 100 : 0,
          failedSubjects: failed,
          pendingSubjects: pending,
          result: pending === rows.length ? "PENDING" : passed ? "PASS" : pending ? "INCOMPLETE" : "FAIL",
          remarks: remarkOf(percent, passed),
          position: 0,
        };
      });

      // Competition ranking (1, 2, 2, 4) on grand total among students with all marks in.
      const ranked = cards
        .filter((c) => c.pendingSubjects === 0)
        .sort((a, b) => b.obtained - a.obtained);
      ranked.forEach((card, i) => {
        card.position = i > 0 && card.obtained === ranked[i - 1].obtained ? ranked[i - 1].position : i + 1;
      });

      const complete = cards.filter((c) => c.pendingSubjects === 0);
      batches.push({
        classId: String(cls._id),
        classLabel: classLabel(cls),
        branchCode: (cls as { branchCode?: string }).branchCode || "",
        head: pickHead(heads((cls as { branchCode?: string }).branchCode)),
        subjects: rows.map((r) => ({
          _id: r._id,
          name: r.name,
          code: r.code,
          totalMarks: r.totalMarks,
          passingMarks: r.passingMarks,
          components: r.components,
        })),
        stats: {
          students: cards.length,
          complete: complete.length,
          passed: complete.filter((c) => c.result === "PASS").length,
          failed: complete.filter((c) => c.result === "FAIL").length,
          average: complete.length
            ? Math.round((complete.reduce((s, c) => s + c.percent, 0) / complete.length) * 10) / 10
            : 0,
          highest: complete.length ? Math.max(...complete.map((c) => c.percent)) : 0,
        },
        cards,
      });
    }

    return {
      // The campus letterhead of the (first) class; each batch also carries its own.
      school: pickHead(heads(batches[0]?.branchCode)),
      term: { name: term.name, academicYear: term.academicYear, type: term.examTypeId?.name || "" },
      showGpa: university,
      batches,
    };
  },

  /** Classes with their mapped subjects — the planner's class picker. */
  async classesWithSubjects() {
    await dbConnect();
    const classes = (await ClassModel.find()
      .select("name section academicYear level subjects")
      .populate("subjects", "name code")
      .lean()) as unknown as ClassLean[];
    const counts = await Student.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { status: "active" } },
      { $group: { _id: "$classId", n: { $sum: 1 } } },
    ]);
    const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
    return sortClasses(classes).map((c) => ({
      _id: String(c._id),
      name: c.name,
      section: c.section,
      classLabel: classLabel(c),
      students: countBy.get(String(c._id)) || 0,
      subjects: (c.subjects || []).map((s) => ({ _id: String(s._id), name: s.name, code: s.code })),
    }));
  },
};
