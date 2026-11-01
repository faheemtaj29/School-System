/**
 * Everything on a student's profile in one call: details and photo, fee ledger,
 * attendance record, exam results and a dated track record.
 */
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { photoUrl } from "@/backend/lib/images";
import { Attendance } from "@/backend/models/Attendance";
import { Exam } from "@/backend/models/Exam";
import { ExamMark, ExamTerm } from "@/backend/models/ExamWorkflow";
import { Fee } from "@/backend/models/Fee";
import { Student } from "@/backend/models/Student";
import { StudentNote, NOTE_KINDS } from "@/backend/models/StudentNote";
import { Enrollment, Lecture } from "@/backend/models/ELearning";
import { printHeader } from "@/backend/services/accounting.service";
import { examCenterService } from "@/backend/services/examCenter.service";
import { ServiceError } from "@/backend/types";

const round = (n: number) => Math.round(n * 100) / 100;

type LedgerRow = { date: Date; number: string; description: string; debit: number; credit: number; balance: number; kind: string; feeId: string };
type Status = "present" | "absent" | "late" | "excused";

async function loadStudent(id: string) {
  if (!isValidObjectId(id)) throw new ServiceError("VALIDATION", "Invalid student ID", 400);
  const s = await Student.findById(id).populate("classId", "name section room").lean();
  if (!s) throw new ServiceError("NOT_FOUND", "Student not found", 404);
  return s;
}

/** Fee ledger: each challan as a charge, concessions and payments as credits, running balance. */
async function feeLedger(studentId: string) {
  const fees = await Fee.find({ studentId }).sort({ createdAt: 1 }).lean();
  const rows: Omit<LedgerRow, "balance">[] = [];
  for (const f of fees) {
    const ref = f.billingMonth ? `CH-${f.billingMonth}` : `CH-${String(f._id).slice(-6).toUpperCase()}`;
    const late = f.lateFeeAmount || 0;
    const discount = f.discountAmount || 0;
    const charge = f.originalAmount ?? round(f.amount - late + discount);
    const feeId = String(f._id);
    rows.push({ date: f.createdAt, number: ref, description: f.title, debit: round(charge), credit: 0, kind: "charge", feeId });
    if (discount > 0) {
      rows.push({
        date: f.createdAt,
        number: ref,
        description: `Concession${f.discountType && f.discountType !== "custom" ? ` (${String(f.discountType).replace(/_/g, " ")})` : ""}${f.discountPercent ? ` ${f.discountPercent}%` : ""}`,
        debit: 0,
        credit: round(discount),
        kind: "concession",
        feeId,
      });
    }
    if (late > 0) {
      rows.push({ date: f.dueDate, number: ref, description: "Late fee", debit: round(late), credit: 0, kind: "late", feeId });
    }
    const payments = f.payments?.length
      ? f.payments
      : f.paidAmount
        ? [{ amount: f.paidAmount, date: f.paymentDate || f.updatedAt, method: f.method || "cash", receiptNo: f.receiptNo || ref }]
        : [];
    for (const p of payments) {
      rows.push({
        date: p.date,
        number: p.receiptNo,
        description: `Payment received (${p.method}) — ${f.title}`,
        debit: 0,
        credit: round(p.amount),
        kind: "payment",
        feeId,
      });
    }
  }
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let balance = 0;
  const withBalance: LedgerRow[] = rows.map((r) => {
    balance = round(balance + r.debit - r.credit);
    return { ...r, balance };
  });
  const sum = (k: "debit" | "credit") => round(rows.reduce((t, r) => t + r[k], 0));
  return {
    rows: withBalance,
    totalDebit: sum("debit"),
    totalCredit: sum("credit"),
    balance,
    challans: fees.map((f) => ({
      _id: String(f._id),
      title: f.title,
      billingMonth: f.billingMonth || "",
      dueDate: f.dueDate,
      amount: f.amount,
      paidAmount: f.paidAmount || 0,
      status: f.status,
    })),
  };
}

/** Attendance: totals, month-by-month, and every marked day (for the calendar). */
async function attendanceRecord(studentId: string) {
  const sheets = await Attendance.find({ "records.studentId": studentId })
    .select("date records classId")
    .sort({ date: -1 })
    .limit(400)
    .lean();
  const days = sheets.map((sh) => {
    const r = sh.records.find((x: { studentId: unknown }) => String(x.studentId) === studentId)!;
    return { date: sh.date, status: r.status as Status, note: r.note || "" };
  });
  const count = (st: Status) => days.filter((d) => d.status === st).length;
  const present = count("present");
  const late = count("late");
  const months = new Map<string, Record<Status, number>>();
  for (const d of days) {
    const key = new Date(d.date).toISOString().slice(0, 7);
    const m = months.get(key) || { present: 0, absent: 0, late: 0, excused: 0 };
    m[d.status] += 1;
    months.set(key, m);
  }
  return {
    total: days.length,
    present,
    absent: count("absent"),
    late,
    excused: count("excused"),
    percent: days.length ? Math.round(((present + late) / days.length) * 1000) / 10 : null,
    months: [...months.entries()].map(([month, m]) => ({ month, ...m })).sort((a, b) => b.month.localeCompare(a.month)),
    days,
  };
}

/** Exam Center result cards for this student, plus older single-paper results. */
async function results(studentId: string) {
  const termIds = await ExamMark.distinct("termId", { studentId });
  const marks = await ExamMark.find({ studentId }).select("termId classId").lean();
  const terms = await ExamTerm.find({ _id: { $in: termIds } }).select("name academicYear startDate createdAt").lean();
  const cards = [];
  for (const term of terms) {
    const classId = String(marks.find((m) => String(m.termId) === String(term._id))?.classId || "");
    if (!classId) continue;
    const data = await examCenterService.resultCards(String(term._id), [classId]);
    for (const b of data.batches) {
      const card = b.cards.find((c) => c.student._id === studentId);
      if (!card) continue;
      cards.push({
        termId: String(term._id),
        classId,
        term: term.name,
        academicYear: term.academicYear,
        date: term.startDate || term.createdAt,
        classLabel: b.classLabel,
        totalMarks: card.totalMarks,
        obtained: card.obtained,
        percent: card.percent,
        grade: card.grade,
        result: card.result,
        position: card.position,
        outOf: b.stats.complete,
        subjects: card.subjects.map((s) => ({ name: s.name, obtained: s.obtained, totalMarks: s.totalMarks, grade: s.grade, status: s.status })),
      });
    }
  }
  cards.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const exams = await Exam.find({ "results.studentId": studentId })
    .populate("subjectId", "name code")
    .select("date examType maxMarks results subjectId title")
    .sort({ date: -1 })
    .lean();
  const tests = exams.map((e) => {
    const r = (e.results || []).find((x: { studentId: unknown }) => String(x.studentId) === studentId)!;
    const subject = e.subjectId as unknown as { name?: string } | null;
    return {
      _id: String(e._id),
      date: e.date,
      title: e.examType || "Test",
      subject: subject?.name || "—",
      marks: r.marks ?? 0,
      maxMarks: e.maxMarks ?? 100,
      grade: r.grade || "",
    };
  });
  return { cards, tests };
}

/** Distance-learning courses with progress (lectures done of lectures in the course). */
async function courses(studentId: string) {
  const list = await Enrollment.find({ studentId, status: { $ne: "dropped" } })
    .populate("courseId", "code title mode status durationWeeks")
    .sort({ enrolledAt: -1 })
    .lean();
  const ids = list.map((e) => (e.courseId as unknown as { _id: unknown } | null)?._id).filter(Boolean);
  const lectureCounts = await Lecture.aggregate<{ _id: unknown; n: number }>([
    { $match: { courseId: { $in: ids } } },
    { $group: { _id: "$courseId", n: { $sum: 1 } } },
  ]);
  return list
    .filter((e) => e.courseId)
    .map((e) => {
      const c = e.courseId as unknown as { _id: unknown; code: string; title: string; mode: string; status: string };
      const lectures = lectureCounts.find((x) => String(x._id) === String(c._id))?.n || 0;
      return {
        _id: String(e._id),
        courseId: String(c._id),
        code: c.code,
        title: c.title,
        mode: c.mode,
        status: e.status,
        enrolledAt: e.enrolledAt,
        progress: e.progress || 0,
        lecturesDone: (e.completedLectureIds || []).length,
        lectures,
      };
    });
}

/** Brothers and sisters: other students with the same parent phone. */
async function siblings(s: { _id: unknown; parentPhone?: string }) {
  const phone = String(s.parentPhone || "").replace(/\D/g, "");
  if (phone.length < 7) return [];
  const candidates = await Student.find({ _id: { $ne: s._id }, parentPhone: { $exists: true, $ne: "" } })
    .select("firstName lastName admissionNo classId status parentPhone photoUpdatedAt")
    .populate("classId", "name section")
    .lean();
  return candidates
    .filter((c) => String(c.parentPhone || "").replace(/\D/g, "").endsWith(phone.slice(-10)))
    .map((c) => {
      const cls = c.classId as unknown as { name?: string; section?: string } | null;
      return {
        _id: String(c._id),
        name: `${c.firstName} ${c.lastName}`,
        admissionNo: c.admissionNo,
        classLabel: cls?.name ? `${cls.name}${cls.section ? ` – ${cls.section}` : ""}` : "—",
        status: c.status,
        photoUrl: photoUrl("student", c._id, c.photoUpdatedAt),
      };
    });
}

export const studentProfileService = {
  async profile(id: string, viewerRole = "admin") {
    await dbConnect();
    const s = await loadStudent(id);
    const portal = viewerRole === "student" || viewerRole === "parent";
    const [ledger, attendance, res, header, courseList, family, notes] = await Promise.all([
      feeLedger(id),
      attendanceRecord(id),
      results(id),
      printHeader(s.branchCode),
      courses(id),
      siblings(s),
      // The family sees only the notes the school chose to share.
      StudentNote.find({ studentId: id, ...(portal ? { shared: true } : {}) }).sort({ date: -1, createdAt: -1 }).limit(200).lean(),
    ]);

    // Track record: the important dated events, newest first.
    const timeline: { date: Date; kind: string; title: string; detail?: string }[] = [];
    if (s.admissionDate || s.createdAt) {
      timeline.push({ date: s.admissionDate || s.createdAt, kind: "admission", title: "Admitted", detail: `Admission no. ${s.admissionNo}` });
    }
    const money = (n: number) => `${header.school.currency} ${n.toLocaleString("en-IN")}`;
    for (const r of ledger.rows) {
      if (r.kind === "charge") timeline.push({ date: r.date, kind: "fee", title: `Fee challan issued — ${r.description}`, detail: `${r.number} · ${money(r.debit)}` });
      if (r.kind === "payment") timeline.push({ date: r.date, kind: "payment", title: "Fee paid", detail: `${r.number} · ${money(r.credit)}` });
    }
    for (const c of res.cards) {
      timeline.push({
        date: c.date,
        kind: "result",
        title: `Result — ${c.term} (${c.academicYear})`,
        detail: `${c.percent}% · ${c.grade} · ${c.result}${c.position ? ` · position ${c.position}` : ""}`,
      });
    }
    for (const d of attendance.days.filter((x) => x.status === "absent").slice(0, 15)) {
      timeline.push({ date: d.date, kind: "absent", title: "Absent", detail: d.note || undefined });
    }
    for (const n of notes.filter((x) => x.kind === "achievement" || x.kind === "behaviour")) {
      timeline.push({ date: n.date, kind: n.kind === "achievement" ? "achievement" : "note", title: n.kind === "achievement" ? "Achievement" : "Behaviour note", detail: n.text.slice(0, 140) });
    }
    if (s.tcIssuedDate) {
      timeline.push({ date: s.tcIssuedDate, kind: "tc", title: "Transfer certificate issued", detail: s.tcNo ? `TC no. ${s.tcNo}` : undefined });
    }
    timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return {
      student: { ...s, photoUrl: photoUrl("student", s._id, s.photoUpdatedAt) },
      currency: header.school.currency,
      school: header.school,
      ledger,
      attendance,
      results: res,
      timeline: timeline.slice(0, 80),
      courses: courseList,
      siblings: family,
      notes: notes.map((n) => ({
        _id: String(n._id),
        kind: n.kind,
        text: n.text,
        date: n.date,
        shared: n.shared,
        by: n.createdByName || "",
      })),
    };
  },

  async addNote(id: string, input: { kind: string; text: string; date?: string; shared?: boolean }, actor: { id: string; name: string }) {
    await dbConnect();
    await loadStudent(id);
    if (!NOTE_KINDS.includes(input.kind as (typeof NOTE_KINDS)[number])) throw new ServiceError("VALIDATION", "Unknown note type", 400);
    const n = await StudentNote.create({
      studentId: id,
      kind: input.kind,
      text: input.text,
      date: input.date ? new Date(input.date) : new Date(),
      shared: Boolean(input.shared),
      createdBy: actor.id,
      createdByName: actor.name,
    });
    return { _id: String(n._id), kind: n.kind, text: n.text, date: n.date, shared: n.shared, by: n.createdByName || "" };
  },

  async removeNote(id: string, noteId: string) {
    await dbConnect();
    const r = await StudentNote.deleteOne({ _id: noteId, studentId: id });
    if (!r.deletedCount) throw new ServiceError("NOT_FOUND", "Note not found", 404);
    return { ok: true };
  },

  /** Mark one student present/absent/late/excused for a day (adds to the class sheet). */
  async markAttendance(id: string, input: { date: string; status: Status; note?: string }, takenBy?: string) {
    await dbConnect();
    const s = await loadStudent(id);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date);
    if (!m) throw new ServiceError("VALIDATION", "Date must be YYYY-MM-DD", 400);
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const classId = (s.classId as unknown as { _id: unknown })?._id || s.classId;
    const record = { studentId: s._id, status: input.status, note: input.note || undefined };
    const updated = await Attendance.updateOne(
      { classId, date, "records.studentId": s._id },
      { $set: { "records.$.status": input.status, "records.$.note": input.note || undefined } }
    );
    if (!updated.matchedCount) {
      await Attendance.updateOne(
        { classId, date },
        { $push: { records: record }, $setOnInsert: { classId, date, takenBy: takenBy || undefined } },
        { upsert: true }
      );
    }
    return attendanceRecord(id);
  },
};
