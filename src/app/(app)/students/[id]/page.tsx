"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NameCell, Panel, StatusBadge, inputClass } from "@/components/ui";
import {
  ClassItem,
  FeeItem,
  StudentItem,
  fullName,
  formatNumber,
  labelOfClass,
  prettyDate,
  toDateInput,
} from "@/lib/types";

/* ── local types ─────────────────────────────────────────────────── */
type ExamResult = {
  _id: string;
  date: string;
  examType: string;
  subject: { name: string; code?: string };
  className: string;
  maxMarks: number;
  marks: number;
  grade?: string;
  remarks?: string;
};

type ProfileTab = "overview" | "fees" | "academics";

/* ── helpers ─────────────────────────────────────────────────────── */
function initials(s: StudentItem) {
  return `${s.firstName?.[0] ?? ""}${s.lastName?.[0] ?? ""}`.toUpperCase();
}

function gradeColor(pct: number) {
  if (pct >= 80) return "#16a34a";
  if (pct >= 60) return "var(--primary)";
  if (pct >= 40) return "var(--warn, #e97316)";
  return "var(--danger)";
}

function pct(marks: number, max: number) {
  if (!max) return 0;
  return Math.round((marks / max) * 100);
}

/* ══════════════════════════════════════════════════════════════════ */
export default function StudentProfilePage() {
  const params = useParams();
  const id = params?.id as string;

  const [student, setStudent] = useState<StudentItem | null>(null);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [exams, setExams] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTab>("overview");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [sRes, fRes, eRes, cRes] = await Promise.all([
        fetch(`/api/students/${id}`).then((r) => r.json()),
        fetch(`/api/fees?studentId=${id}`).then((r) => r.json()),
        fetch("/api/exams").then((r) => r.json()),
        fetch("/api/classes").then((r) => r.json()),
      ]);
      setStudent(sRes.student ?? null);
      setFees(fRes.fees ?? []);
      setClasses(cRes.classes ?? []);

      // filter exam results for this student
      const allExams = eRes.exams ?? [];
      const results: ExamResult[] = [];
      for (const exam of allExams) {
        const myResult = (exam.results ?? []).find((r: { studentId: { _id?: string } | string }) => {
          const sid = typeof r.studentId === "object" ? r.studentId._id : r.studentId;
          return sid === id;
        });
        if (myResult) {
          results.push({
            _id: exam._id,
            date: exam.date,
            examType: exam.examType ?? "Exam",
            subject: typeof exam.subjectId === "object"
              ? { name: exam.subjectId.name, code: exam.subjectId.code }
              : { name: "Unknown" },
            className: typeof exam.classId === "object"
              ? `${exam.classId.name}-${exam.classId.section}`
              : "—",
            maxMarks: exam.maxMarks ?? 100,
            marks: myResult.marks ?? 0,
            grade: myResult.grade,
            remarks: myResult.remarks,
          });
        }
      }
      results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExams(results);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* ── computed stats ─────────────────────────────────────────────── */
  const feeStats = useMemo(() => {
    const billed = fees.reduce((s, f) => s + (f.amount || 0), 0);
    const collected = fees.reduce((s, f) => s + (f.paidAmount || 0), 0);
    const outstanding = fees.filter((f) => f.status !== "paid").reduce((s, f) => s + Math.max(0, (f.amount || 0) - (f.paidAmount || 0)), 0);
    const paid = fees.filter((f) => f.status === "paid").length;
    const pending = fees.filter((f) => f.status !== "paid").length;
    return { billed, collected, outstanding, paid, pending };
  }, [fees]);

  const examStats = useMemo(() => {
    if (!exams.length) return null;
    const totalPct = exams.reduce((s, e) => s + pct(e.marks, e.maxMarks), 0);
    const avg = Math.round(totalPct / exams.length);
    const highest = exams.reduce((best, e) => pct(e.marks, e.maxMarks) > pct(best.marks, best.maxMarks) ? e : best, exams[0]);
    const lowest = exams.reduce((worst, e) => pct(e.marks, e.maxMarks) < pct(worst.marks, worst.maxMarks) ? e : worst, exams[0]);
    return { avg, highest, lowest, total: exams.length };
  }, [exams]);

  /* ── loading / not found ────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-dim)" }}>
        Loading student profile…
      </div>
    );
  }
  if (!student) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--text-dim)" }}>
        Student not found.{" "}
        <Link href="/students" style={{ color: "var(--primary)" }}>Go back</Link>
      </div>
    );
  }

  const className = labelOfClass(student.classId as ClassItem);

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <>
      {/* Back navigation */}
      <div style={{ padding: "12px 24px 0" }}>
        <Link
          href="/students"
          style={{ fontSize: 13, color: "var(--text-dim)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          ← Students
        </Link>
      </div>

      {/* ── Profile header ──────────────────────────────────────────── */}
      <div style={{
        margin: "12px 24px 0",
        padding: "20px 24px",
        background: "var(--card)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        display: "flex",
        gap: 20,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}>
        {/* Avatar */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "var(--primary)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 700, flexShrink: 0, letterSpacing: 1,
        }}>
          {initials(student)}
        </div>

        {/* Main info */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{fullName(student)}</h2>
            <StatusBadge status={student.status} />
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--text-dim)" }}>
            <span>Admission No: <strong style={{ color: "var(--fg, currentColor)" }}>{student.admissionNo}</strong></span>
            {student.rollNumber ? <span>Roll No: <strong style={{ color: "var(--fg, currentColor)" }}>{student.rollNumber}</strong></span> : null}
            <span>Class: <strong style={{ color: "var(--fg, currentColor)" }}>{className || "—"}</strong></span>
            {student.admissionDate ? <span>Admitted: <strong style={{ color: "var(--fg, currentColor)" }}>{prettyDate(student.admissionDate)}</strong></span> : null}
          </div>
          <div style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "var(--text-dim)" }}>
            {student.gender ? <span>{student.gender}</span> : null}
            {student.dateOfBirth ? <span>DOB: {prettyDate(student.dateOfBirth)}</span> : null}
            {student.phone ? <span>📞 {student.phone}</span> : null}
            {student.email ? <span>✉ {student.email}</span> : null}
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", minWidth: 72 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: feeStats.outstanding > 0 ? "var(--danger)" : "#16a34a" }}>
              {feeStats.outstanding > 0 ? `PKR ${formatNumber(feeStats.outstanding)}` : "✓"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Outstanding</div>
          </div>
          {examStats ? (
            <div style={{ textAlign: "center", minWidth: 72 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: gradeColor(examStats.avg) }}>
                {examStats.avg}%
              </div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>Avg Score</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="tabs" style={{ margin: "16px 24px 0" }}>
        {([
          { key: "overview", label: "Overview" },
          { key: "fees",     label: `Fees (${fees.length})` },
          { key: "academics", label: `Academics (${exams.length})` },
        ] as { key: ProfileTab; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ OVERVIEW TAB ════════════════════════════════════════════════ */}
      {tab === "overview" ? (
        <>
          {/* Personal details */}
          <Panel title="Personal Information" style={{ margin: "12px 24px 0" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 24px", fontSize: 13 }}>
              <InfoRow label="Full Name" value={fullName(student)} />
              <InfoRow label="Admission No." value={student.admissionNo} />
              <InfoRow label="Roll Number" value={student.rollNumber} />
              <InfoRow label="Class" value={className} />
              <InfoRow label="Gender" value={student.gender} />
              <InfoRow label="Date of Birth" value={student.dateOfBirth ? prettyDate(student.dateOfBirth) : undefined} />
              <InfoRow label="CNIC / B-Form" value={student.cnic} />
              <InfoRow label="Nationality" value={student.nationality} />
              <InfoRow label="Religion" value={student.religion} />
              <InfoRow label="Admission Date" value={student.admissionDate ? prettyDate(student.admissionDate) : undefined} />
              <InfoRow label="Email" value={student.email} />
              <InfoRow label="Phone" value={student.phone} />
              {student.address ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <InfoRow label="Address" value={student.address} />
                </div>
              ) : null}
              {student.previousSchool ? (
                <InfoRow label="Previous School" value={student.previousSchool} />
              ) : null}
            </div>
          </Panel>

          {/* Guardian details */}
          {(student.parentName || student.parentPhone || student.parentEmail) ? (
            <Panel title="Guardian / Parent" style={{ margin: "12px 24px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 24px", fontSize: 13 }}>
                <InfoRow label="Name" value={student.parentName} />
                <InfoRow label="Phone" value={student.parentPhone} />
                <InfoRow label="Email" value={student.parentEmail} />
              </div>
            </Panel>
          ) : null}

          {/* Fee snapshot */}
          <Panel title="Fee Snapshot" style={{ margin: "12px 24px 0" }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <StatTile label="Total Billed" value={`PKR ${formatNumber(feeStats.billed)}`} />
              <StatTile label="Collected" value={`PKR ${formatNumber(feeStats.collected)}`} color="#16a34a" />
              <StatTile label="Outstanding" value={`PKR ${formatNumber(feeStats.outstanding)}`} color={feeStats.outstanding > 0 ? "var(--danger)" : undefined} />
              <StatTile label="Paid Vouchers" value={String(feeStats.paid)} />
              <StatTile label="Pending" value={String(feeStats.pending)} color={feeStats.pending > 0 ? "var(--warn, #e97316)" : undefined} />
            </div>
          </Panel>

          {/* Academic snapshot */}
          {examStats ? (
            <Panel title="Academic Snapshot" style={{ margin: "12px 24px 0" }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <StatTile label="Exams Taken" value={String(examStats.total)} />
                <StatTile label="Average Score" value={`${examStats.avg}%`} color={gradeColor(examStats.avg)} />
                <StatTile label="Best Subject" value={examStats.highest.subject.name} sub={`${pct(examStats.highest.marks, examStats.highest.maxMarks)}%`} color="#16a34a" />
                <StatTile label="Needs Attention" value={examStats.lowest.subject.name} sub={`${pct(examStats.lowest.marks, examStats.lowest.maxMarks)}%`} color={gradeColor(pct(examStats.lowest.marks, examStats.lowest.maxMarks))} />
              </div>
            </Panel>
          ) : null}

          {/* TC info if issued */}
          {student.tcNo ? (
            <Panel title="Transfer Certificate" style={{ margin: "12px 24px 0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px 24px", fontSize: 13 }}>
                <InfoRow label="TC No." value={student.tcNo} />
                <InfoRow label="Issued Date" value={student.tcIssuedDate ? prettyDate(student.tcIssuedDate) : undefined} />
                <InfoRow label="Leaving Date" value={student.leavingDate ? prettyDate(student.leavingDate) : undefined} />
                <InfoRow label="Reason" value={student.leavingReason} />
                <InfoRow label="Conduct" value={student.conductRemark} />
              </div>
            </Panel>
          ) : null}
        </>
      ) : null}

      {/* ══ FEES TAB ════════════════════════════════════════════════════ */}
      {tab === "fees" ? (
        <Panel title="Fee History" meta={`${fees.length} VOUCHER${fees.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
          {!fees.length ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
              No fee vouchers generated yet.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th className="num">Due Date</th>
                    <th className="num">Amount</th>
                    <th className="num">Paid</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.map((fee) => (
                    <tr key={fee._id} style={{ background: fee.status === "overdue" ? "var(--red-bg, #fff1f1)" : undefined }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{fee.title}</div>
                        {fee.lines?.length ? (
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {fee.lines.map((l) => `${l.head}: PKR ${formatNumber(l.amount)}`).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">{prettyDate(fee.dueDate)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>PKR {formatNumber(fee.amount)}</td>
                      <td className="num" style={{ color: (fee.paidAmount || 0) > 0 ? "#16a34a" : "var(--text-dim)" }}>
                        {(fee.paidAmount || 0) > 0 ? `PKR ${formatNumber(fee.paidAmount)}` : "—"}
                      </td>
                      <td className="right">
                        <StatusBadge status={fee.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {/* ══ ACADEMICS TAB ═══════════════════════════════════════════════ */}
      {tab === "academics" ? (
        <Panel title="Exam Results" meta={`${exams.length} RESULT${exams.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
          {!exams.length ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
              No exam results recorded yet.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Exam Type</th>
                    <th className="num">Date</th>
                    <th className="num">Marks</th>
                    <th className="num">%</th>
                    <th className="right">Grade</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((e) => {
                    const scorePct = pct(e.marks, e.maxMarks);
                    return (
                      <tr key={e._id}>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{e.subject.name}</div>
                          {e.subject.code ? <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{e.subject.code}</div> : null}
                        </td>
                        <td style={{ fontSize: 13 }}>{e.examType}</td>
                        <td className="num">{prettyDate(e.date)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{e.marks} / {e.maxMarks}</td>
                        <td className="num">
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 99,
                            background: `${gradeColor(scorePct)}22`,
                            color: gradeColor(scorePct), fontWeight: 700, fontSize: 12,
                          }}>
                            {scorePct}%
                          </span>
                        </td>
                        <td className="right">
                          {e.grade ? <StatusBadge status={e.grade} /> : <span style={{ color: "var(--text-dim)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: 12, color: "var(--text-dim)" }}>{e.remarks || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      <div style={{ height: 40 }} />
    </>
  );
}

/* ── sub-components ─────────────────────────────────────────────── */
function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-dim)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}

function StatTile({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--line)", minWidth: 120 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || undefined }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: color || "var(--text-dim)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}
