/**
 * Printable / exportable reports from live data.
 */
import { dbConnect } from "@/backend/config/database";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { Fee } from "@/backend/models/Fee";
import { Attendance } from "@/backend/models/Attendance";
import { Exam } from "@/backend/models/Exam";
import { ClassModel } from "@/backend/models/Class";
import { LedgerEntry } from "@/backend/models/Ledger";
import { InventoryItem } from "@/backend/models/Inventory";
import { Payslip } from "@/backend/models/HR";
import { ServiceError } from "@/backend/types";

export const reportsService = {
  async studentsByClass() {
    await dbConnect();
    return Student.aggregate([
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
          className: { $first: { $concat: ["$class.name", "-", "$class.section"] } },
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        },
      },
      { $sort: { className: 1 } },
    ]);
  },

  async feeDefaulters() {
    await dbConnect();
    return Fee.find({ status: { $in: ["pending", "partial", "overdue"] } })
      .populate({
        path: "studentId",
        select: "firstName lastName admissionNo classId phone parentPhone",
        populate: { path: "classId", select: "name section" },
      })
      .sort({ dueDate: 1 })
      .lean();
  },

  async attendanceSummary() {
    await dbConnect();
    const sheets = await Attendance.find()
      .sort({ date: -1 })
      .limit(30)
      .populate("classId", "name section")
      .lean();

    return sheets.map((s) => {
      const total = s.records?.length ?? 0;
      const present = s.records?.filter((r: { status: string }) => r.status === "present").length ?? 0;
      return {
        _id: s._id,
        date: s.date,
        classId: s.classId,
        total,
        present,
        rate: total ? Math.round((present / total) * 100) : 0,
      };
    });
  },

  async examOverview() {
    await dbConnect();
    return Exam.find()
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .sort({ date: -1 })
      .limit(20)
      .lean();
  },

  async staffDirectory() {
    await dbConnect();
    return Teacher.find().sort({ firstName: 1 }).lean();
  },

  async classStrength() {
    await dbConnect();
    const classes = await ClassModel.find().sort({ name: 1, section: 1 }).lean();
    const counts = await Student.aggregate([
      { $group: { _id: "$classId", count: { $sum: 1 } } },
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.count]));
    return classes.map((c) => ({
      ...c,
      enrolled: map.get(String(c._id)) ?? 0,
    }));
  },

  async financeSnapshot() {
    await dbConnect();
    const [fees, ledger, payroll, stock, bySource] = await Promise.all([
      Fee.aggregate([
        {
          $group: {
            _id: null,
            billed: { $sum: "$amount" },
            collected: { $sum: "$paidAmount" },
          },
        },
      ]),
      LedgerEntry.aggregate([
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
            tax: { $sum: "$taxAmount" },
          },
        },
      ]),
      Payslip.aggregate([
        { $group: { _id: "$status", total: { $sum: "$net" } } },
      ]),
      InventoryItem.aggregate([
        { $group: { _id: null, v: { $sum: { $multiply: ["$quantity", "$unitCost"] } } } },
      ]),
      LedgerEntry.aggregate([
        {
          $group: {
            _id: "$sourceType",
            income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
            expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          },
        },
      ]),
    ]);
    const income = ledger.find((r) => r._id === "income")?.total ?? 0;
    const expense = ledger.find((r) => r._id === "expense")?.total ?? 0;
    const taxCollected = ledger.reduce((s, r) => s + (r.tax || 0), 0);
    const sources: Record<string, { income: number; expense: number }> = {};
    for (const s of bySource) {
      sources[s._id || "manual"] = { income: s.income, expense: s.expense };
    }
    return {
      fees: fees[0] ?? { billed: 0, collected: 0 },
      ledger: { income, expense, balance: income - expense, taxCollected },
      payroll: {
        paid: payroll.find((r) => r._id === "paid")?.total ?? 0,
        pending: payroll.find((r) => r._id === "pending")?.total ?? 0,
      },
      inventoryValue: stock[0]?.v ?? 0,
      bySource: sources,
      integrated: true,
    };
  },

  async inventoryReport() {
    await dbConnect();
    return InventoryItem.find().sort({ category: 1, name: 1 }).lean();
  },

  /**
   * Result cards for a whole class: subject marks are consolidated across every
   * exam of the selected type, then graded and ranked.
   */
  async resultCards(classId: string, examType?: string | null) {
    await dbConnect();
    const cls = await ClassModel.findById(classId).lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);

    const examQuery: Record<string, unknown> = { classId };
    if (examType) examQuery.examType = examType;
    const [students, exams] = await Promise.all([
      Student.find({ classId, status: "active" })
        .sort({ rollNumber: 1, firstName: 1 })
        .lean(),
      Exam.find(examQuery).populate("subjectId", "name code credits").sort({ date: 1 }).lean(),
    ]);

    const cards = buildResultCards(students, exams);

    return {
      class: {
        _id: String(cls._id),
        name: cls.name,
        section: cls.section,
        academicYear: cls.academicYear,
      },
      examType: examType || "all",
      examCount: exams.length,
      cards,
      batch: false,
    };
  },

  /**
   * One-shot campus/class batch — pulls every active student + graded exams,
   * no manual marks entry. Use classId "all" for the whole institution.
   */
  async resultCardsBatch(opts: {
    classId?: string | null;
    examType?: string | null;
    branchCode?: string | null;
  }) {
    await dbConnect();
    const classFilter: Record<string, unknown> = {};
    if (opts.classId && opts.classId !== "all") classFilter._id = opts.classId;
    if (opts.branchCode) classFilter.branchCode = opts.branchCode.toUpperCase();

    const classes = await ClassModel.find(classFilter).sort({ level: 1, name: 1, section: 1 }).lean();
    if (!classes.length) {
      throw new ServiceError("NOT_FOUND", "No classes found for this selection", 404);
    }

    const classIds = classes.map((c) => c._id);
    const examQuery: Record<string, unknown> = { classId: { $in: classIds } };
    if (opts.examType) examQuery.examType = opts.examType;

    const [students, exams] = await Promise.all([
      Student.find({ classId: { $in: classIds }, status: "active" })
        .sort({ rollNumber: 1, firstName: 1 })
        .lean(),
      Exam.find(examQuery).populate("subjectId", "name code credits").sort({ date: 1 }).lean(),
    ]);

    const examsByClass = new Map<string, typeof exams>();
    for (const exam of exams) {
      const key = String(exam.classId);
      const list = examsByClass.get(key) || [];
      list.push(exam);
      examsByClass.set(key, list);
    }

    const classMap = new Map(classes.map((c) => [String(c._id), c]));
    const batches = [];
    let totalCards = 0;

    for (const cls of classes) {
      const classStudents = students.filter((s) => String(s.classId) === String(cls._id));
      if (!classStudents.length) continue;
      const classExams = examsByClass.get(String(cls._id)) || [];
      const cards = buildResultCards(classStudents, classExams);
      totalCards += cards.length;
      batches.push({
        class: {
          _id: String(cls._id),
          name: cls.name,
          section: cls.section,
          academicYear: cls.academicYear,
        },
        examCount: classExams.length,
        cards,
      });
    }

    return {
      examType: opts.examType || "all",
      batch: true,
      classCount: batches.length,
      examCount: exams.length,
      cardCount: totalCards,
      batches,
      /** Flat list for simple UIs / single print pass. */
      cards: batches.flatMap((b) =>
        b.cards.map((card) => ({
          ...card,
          classLabel: `${b.class.name}-${b.class.section}`,
          academicYear: b.class.academicYear,
        }))
      ),
      class: {
        _id: "all",
        name: opts.classId && opts.classId !== "all" ? classMap.get(opts.classId)?.name || "Class" : "All Classes",
        section: opts.classId && opts.classId !== "all" ? classMap.get(opts.classId)?.section || "" : "Campus",
        academicYear: classes[0]?.academicYear || "",
      },
    };
  },

  /** Official transcript with GPA / CGPA for one student. */
  async transcript(studentId: string) {
    await dbConnect();
    const student = await Student.findById(studentId)
      .populate("classId", "name section academicYear")
      .lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);

    const exams = await Exam.find({ "results.studentId": student._id })
      .populate("subjectId", "name code credits")
      .populate("classId", "name section academicYear")
      .sort({ date: 1 })
      .lean();

    const terms = new Map<
      string,
      {
        label: string;
        rows: {
          subject: string;
          code: string;
          credits: number;
          maxMarks: number;
          obtained: number;
          percent: number;
          grade: string;
          points: number;
        }[];
      }
    >();

    for (const exam of exams) {
      const result = exam.results?.find((r) => String(r.studentId) === String(student._id));
      if (!result || result.marks == null) continue;
      const subject = exam.subjectId as unknown as {
        name?: string;
        code?: string;
        credits?: number;
      } | null;
      const cls = exam.classId as unknown as { academicYear?: string; name?: string } | null;
      const termKey = cls?.academicYear || "Session";
      const term =
        terms.get(termKey) ||
        {
          label: termKey,
          rows: [],
        };
      const max = exam.maxMarks || 100;
      const obtained = result.marks || 0;
      const percent = max ? (obtained / max) * 100 : 0;
      const credits = subject?.credits && subject.credits > 0 ? subject.credits : 1;
      term.rows.push({
        subject: subject?.name || exam.title,
        code: subject?.code || "—",
        credits,
        maxMarks: max,
        obtained,
        percent: Math.round(percent),
        grade: gradeOf(percent),
        points: gpaPoints(percent),
      });
      terms.set(termKey, term);
    }

    const termSheets = [...terms.values()].map((term) => {
      const creditSum = term.rows.reduce((s, r) => s + r.credits, 0);
      const pointSum = term.rows.reduce((s, r) => s + r.points * r.credits, 0);
      const gpa = creditSum ? Math.round((pointSum / creditSum) * 100) / 100 : 0;
      return { ...term, credits: creditSum, gpa };
    });

    const allCredits = termSheets.reduce((s, t) => s + t.credits, 0);
    const allPoints = termSheets.reduce(
      (s, t) => s + t.rows.reduce((ps, r) => ps + r.points * r.credits, 0),
      0
    );
    const cgpa = allCredits ? Math.round((allPoints / allCredits) * 100) / 100 : 0;

    return {
      student: {
        _id: String(student._id),
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        class: student.classId,
      },
      terms: termSheets,
      cgpa,
      totalCredits: allCredits,
    };
  },
};

type StudentDoc = {
  _id: unknown;
  firstName: string;
  lastName: string;
  admissionNo: string;
  rollNumber?: string;
  parentName?: string;
};

type ExamDoc = {
  _id: unknown;
  title: string;
  maxMarks: number;
  subjectId?: unknown;
  results?: { studentId: unknown; marks?: number }[];
};

function buildResultCards(students: StudentDoc[], exams: ExamDoc[]) {
  const cards = students.map((student) => {
    const subjects = new Map<
      string,
      {
        name: string;
        code: string;
        credits: number;
        maxMarks: number;
        obtained: number;
        graded: boolean;
      }
    >();

    for (const exam of exams) {
      const subject = exam.subjectId as unknown as
        | { _id: unknown; name: string; code: string; credits?: number }
        | null;
      const key = subject ? String(subject._id) : String(exam._id);
      const entry =
        subjects.get(key) ||
        {
          name: subject?.name || exam.title,
          code: subject?.code || "—",
          credits: subject?.credits && subject.credits > 0 ? subject.credits : 1,
          maxMarks: 0,
          obtained: 0,
          graded: false,
        };
      const result = exam.results?.find(
        (r) => String(r.studentId) === String(student._id)
      );
      entry.maxMarks += exam.maxMarks || 0;
      if (result) {
        entry.obtained += result.marks || 0;
        entry.graded = true;
      }
      subjects.set(key, entry);
    }

    const rows = [...subjects.values()]
      .filter((row) => row.maxMarks > 0)
      .map((row) => {
        const percent =
          row.graded && row.maxMarks ? Math.round((row.obtained / row.maxMarks) * 100) : 0;
        return {
          name: row.name,
          code: row.code,
          credits: row.credits,
          maxMarks: row.maxMarks,
          obtained: row.graded ? row.obtained : null,
          percent,
          grade: row.graded ? gradeOf(percent) : "—",
          points: row.graded ? gpaPoints(percent) : 0,
        };
      });

    const totalMax = rows.reduce((sum, row) => sum + row.maxMarks, 0);
    const totalObtained = rows.reduce((sum, row) => sum + (row.obtained ?? 0), 0);
    const percentage = totalMax ? Math.round((totalObtained / totalMax) * 100) : 0;
    const creditSum = rows.reduce((sum, row) => sum + (row.obtained != null ? row.credits : 0), 0);
    const pointSum = rows.reduce(
      (sum, row) => sum + (row.obtained != null ? row.points * row.credits : 0),
      0
    );
    const gpa = creditSum ? Math.round((pointSum / creditSum) * 100) / 100 : 0;

    return {
      student: {
        _id: String(student._id),
        name: `${student.firstName} ${student.lastName}`,
        admissionNo: student.admissionNo,
        rollNumber: student.rollNumber || "",
        parentName: student.parentName || "",
      },
      subjects: rows,
      totalMax,
      totalObtained,
      percentage,
      gpa,
      grade: gradeOf(percentage),
      result: percentage >= 40 ? "PASS" : "FAIL",
      position: 0,
    };
  });

  const ranked = [...cards].sort((a, b) => b.percentage - a.percentage);
  ranked.forEach((card, index) => {
    card.position = index + 1;
  });
  /** Keep roll order in output, but with class positions applied. */
  const positionById = new Map(ranked.map((c) => [c.student._id, c.position]));
  return cards.map((card) => ({
    ...card,
    position: positionById.get(card.student._id) || 0,
  }));
}

function gradeOf(percent: number) {
  if (percent >= 80) return "A+";
  if (percent >= 70) return "A";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C";
  if (percent >= 40) return "D";
  return "F";
}

/** 4.0 scale used for GPA / CGPA on result cards and transcripts. */
function gpaPoints(percent: number) {
  if (percent >= 85) return 4.0;
  if (percent >= 80) return 3.7;
  if (percent >= 75) return 3.3;
  if (percent >= 70) return 3.0;
  if (percent >= 65) return 2.7;
  if (percent >= 60) return 2.3;
  if (percent >= 55) return 2.0;
  if (percent >= 50) return 1.7;
  if (percent >= 45) return 1.3;
  if (percent >= 40) return 1.0;
  return 0;
}
