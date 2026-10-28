"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Panel, StatusBadge } from "@/components/ui";
import { FeePaymentDialog } from "@/components/forms/FeePaymentDialog";
import {
  FeeItem,
  FeePaymentItem,
  StudentItem,
  fullName,
  formatNumber,
  labelOfClass,
  prettyDate,
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

type ProfileTab = "info" | "fees" | "history";
type StudentLedgerVoucher = {
  _id: string;
  number: string;
  voucherType: string;
  status: string;
  date: string;
  narration: string;
  reference?: string;
  grandTotal: number;
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[];
};

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

function fineAmount(fee: FeeItem) {
  if (fee.lateFeeAmount) return fee.lateFeeAmount;
  return (fee.lines || [])
    .filter((line) => /fine|late fee|penalty/i.test(line.head))
    .reduce((sum, line) => sum + line.amount, 0);
}

/* ══════════════════════════════════════════════════════════════════ */
export default function StudentProfilePage() {
  const params = useParams();
  const id = params?.id as string;

  const [student, setStudent] = useState<StudentItem | null>(null);
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [ledger, setLedger] = useState<StudentLedgerVoucher[]>([]);
  const [exams, setExams] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ProfileTab>("info");
  const [role, setRole] = useState("student");
  const [paymentDialog, setPaymentDialog] = useState<{
    fee: FeeItem;
    receipt?: FeePaymentItem;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [sRes, fRes, eRes, meRes] = await Promise.all([
        fetch(`/api/students/${id}`).then((r) => r.json()),
        fetch(`/api/fees?studentId=${id}`).then((r) => r.json()),
        fetch("/api/exams").then((r) => r.json()),
        fetch("/api/auth/me").then((r) => r.json()),
      ]);
      setStudent(sRes.student ?? null);
      setFees(fRes.fees ?? []);
      setLedger(fRes.ledger ?? []);
      setRole(meRes.user?.role || "student");

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
    const outstanding = fees.reduce((sum, fee) => sum + Math.max(0, (fee.amount || 0) - (fee.paidAmount || 0)), 0);
    const fines = fees.reduce((sum, fee) => {
        return sum + fineAmount(fee);
      }, 0);
    return { billed, collected, outstanding, fines };
  }, [fees]);

  const canReceive = role === "admin" || role === "staff";

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

  const className = labelOfClass(student.classId);
  const receipts = fees.flatMap((fee) =>
    (fee.payments || []).map((receipt) => ({ fee, receipt }))
  );
  const fineFees = fees.filter((fee) =>
    fineAmount(fee) > 0
  );
  const discountedFees = fees.filter((fee) => (fee.discountAmount || 0) > 0);

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
        <div className="student-profile-avatar">
          {student.profilePhoto ? (
            <Image src={student.profilePhoto} alt="" width={88} height={88} unoptimized />
          ) : initials(student)}
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

      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <div className="tabs" style={{ margin: "16px 24px 0" }}>
        {([
          { key: "info", label: "Student Information" },
          { key: "fees", label: `Fees & Payments (${fees.length})` },
          { key: "history", label: "History & Reports" },
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
      {tab === "info" ? (
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
        <>
          <div className="student-fee-summary" aria-label="Fee summary">
            <StatTile label="Total Fee" value={`PKR ${formatNumber(feeStats.billed)}`} />
            <StatTile label="Paid Amount" value={`PKR ${formatNumber(feeStats.collected)}`} color="#168451" />
            <StatTile label="Pending Amount" value={`PKR ${formatNumber(feeStats.outstanding)}`} color={feeStats.outstanding > 0 ? "var(--danger)" : undefined} />
            <StatTile label="Fine Amount" value={`PKR ${formatNumber(feeStats.fines)}`} color={feeStats.fines > 0 ? "var(--warn, #e97316)" : undefined} />
          </div>
          <Panel title="Fee challans" meta={`${fees.length} RECORD${fees.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
          {!fees.length ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
              No fee vouchers generated yet.
            </div>
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Challan</th>
                    <th className="num">Due Date</th>
                    <th className="num">Amount</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
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
                        {fee.discountAmount ? (
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            Discount / scholarship · PKR {formatNumber(fee.discountAmount)}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">{prettyDate(fee.dueDate)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>PKR {formatNumber(fee.amount)}</td>
                      <td className="num" style={{ color: (fee.paidAmount || 0) > 0 ? "#16a34a" : "var(--text-dim)" }}>
                        {(fee.paidAmount || 0) > 0 ? `PKR ${formatNumber(fee.paidAmount)}` : "—"}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>
                        PKR {formatNumber(Math.max(0, fee.amount - (fee.paidAmount || 0)))}
                      </td>
                      <td className="right">
                        <StatusBadge status={fee.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {canReceive && fee.amount > (fee.paidAmount || 0) ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setPaymentDialog({ fee })}
                            >
                              Receive
                            </button>
                          ) : null}
                          {fee.payments?.length ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setPaymentDialog({ fee, receipt: fee.payments?.[0] })}
                            >
                              Receipts ({fee.payments.length})
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </Panel>
        </>
      ) : null}

      {/* ══ HISTORY & REPORTS TAB ═══════════════════════════════════════ */}
      {tab === "history" ? (
        <>
        <Panel title="Fee challan history" meta={`${fees.length} CHALLAN${fees.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
          {!fees.length ? <EmptyHistory message="No fee challans have been generated." /> : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr><th>Fee / Challan</th><th className="num">Due</th><th className="num">Fee</th><th className="num">Discount</th><th className="num">Fine</th><th className="right">Balance / Status</th></tr>
                </thead>
                <tbody>
                  {fees.map((fee) => (
                    <tr key={fee._id}>
                      <td>{fee.title}</td>
                      <td className="num">{prettyDate(fee.dueDate)}</td>
                      <td className="num">PKR {formatNumber(fee.amount)}</td>
                      <td className="num">{fee.discountAmount ? `PKR ${formatNumber(fee.discountAmount)}` : "—"}</td>
                      <td className="num">{fineAmount(fee) ? `PKR ${formatNumber(fineAmount(fee))}` : "—"}</td>
                      <td className="right">
                        <div>PKR {formatNumber(Math.max(0, fee.amount - fee.paidAmount))}</div>
                        <StatusBadge status={fee.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Payment receipt history" meta={`${receipts.length} RECEIPT${receipts.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
          {!receipts.length ? <EmptyHistory message="No receipt records are available for this student." /> : (
            <div className="table-scroll">
              <table className="reg">
                <thead><tr><th>Receipt</th><th>Fee challan</th><th className="num">Payment date</th><th className="num">Amount</th><th>Method / Reference</th><th className="right">Status</th><th /></tr></thead>
                <tbody>
                  {receipts.map(({ fee, receipt }) => (
                    <tr key={receipt._id}>
                      <td className="mono">{receipt.receiptNumber}</td>
                      <td>{fee.title}</td>
                      <td className="num">{prettyDate(receipt.paymentDate)}</td>
                      <td className="num">PKR {formatNumber(receipt.amount)}</td>
                      <td>{receipt.method.toUpperCase()} · {receipt.transactionReference || "No reference"}</td>
                      <td className="right"><StatusBadge status={receipt.status === "posted" ? "paid" : "reversed"} /></td>
                      <td>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setPaymentDialog({ fee, receipt })}
                        >
                          View receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="student-history-grid">
          <Panel title="Fine history" style={{ margin: "12px 0 0" }}>
            {!fineFees.length ? <EmptyHistory message="No fine or late-fee records." /> : (
              <div className="table-scroll">
                <table className="reg">
                  <thead><tr><th>Challan / Reason</th><th className="num">Due date</th><th className="num">Amount</th></tr></thead>
                  <tbody>{fineFees.map((fee) => (
                    <tr key={fee._id}>
                      <td>{fee.lines?.filter((line) => /fine|late fee|penalty/i.test(line.head)).map((line) => line.head).join(", ") || "Late fee"} · {fee.title}</td>
                      <td className="num">{prettyDate(fee.dueDate)}</td>
                      <td className="num">PKR {formatNumber(fineAmount(fee))}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Discounts & scholarships" style={{ margin: "12px 0 0" }}>
            {!discountedFees.length ? <EmptyHistory message="No discount or scholarship records." /> : (
              <div className="table-scroll">
                <table className="reg">
                  <thead><tr><th>Challan</th><th>Type</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
                  <tbody>{discountedFees.map((fee) => (
                    <tr key={fee._id}>
                      <td>{fee.title}</td>
                      <td>{fee.discountType || "Discount"}</td>
                      <td className="num">{fee.discountPercent || 0}%</td>
                      <td className="num">PKR {formatNumber(fee.discountAmount || 0)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Student accounting ledger" meta={`${ledger.length} VOUCHER${ledger.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
          {!ledger.length ? <EmptyHistory message="No accounting vouchers are linked to this student's fee records." /> : (
            <div className="table-scroll">
              <table className="reg">
                <thead><tr><th>Date</th><th>Voucher / Description</th><th>Accounts</th><th className="num">Debit</th><th className="num">Credit</th><th className="right">Status</th></tr></thead>
                <tbody>{ledger.map((voucher) => {
                  const debit = voucher.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
                  const credit = voucher.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
                  return (
                    <tr key={voucher._id}>
                      <td className="num">{prettyDate(voucher.date)}</td>
                      <td><div className="mono">{voucher.number}</div><div>{voucher.narration}</div></td>
                      <td>{voucher.lines.map((line) => `${line.accountCode} · ${line.accountName}`).join(", ")}</td>
                      <td className="num">{debit ? `PKR ${formatNumber(debit)}` : "—"}</td>
                      <td className="num">{credit ? `PKR ${formatNumber(credit)}` : "—"}</td>
                      <td className="right"><StatusBadge status={voucher.status} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </Panel>

        {examStats ? (
          <Panel title="Academic summary" style={{ margin: "12px 24px 0" }}>
            <div className="student-fee-summary" style={{ margin: 0, padding: 0 }}>
              <StatTile label="Exams Taken" value={String(examStats.total)} />
              <StatTile label="Average Score" value={`${examStats.avg}%`} color={gradeColor(examStats.avg)} />
              <StatTile label="Best Subject" value={examStats.highest.subject.name} sub={`${pct(examStats.highest.marks, examStats.highest.maxMarks)}%`} color="#16a34a" />
              <StatTile label="Needs Attention" value={examStats.lowest.subject.name} sub={`${pct(examStats.lowest.marks, examStats.lowest.maxMarks)}%`} color={gradeColor(pct(examStats.lowest.marks, examStats.lowest.maxMarks))} />
            </div>
          </Panel>
        ) : null}

        <Panel title="Exam results" meta={`${exams.length} RESULT${exams.length !== 1 ? "S" : ""}`} style={{ margin: "12px 24px 0" }}>
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
        </>
      ) : null}

      {paymentDialog ? (
        <FeePaymentDialog
          fee={paymentDialog.fee}
          initialReceipt={paymentDialog.receipt}
          canReverse={role === "admin"}
          onClose={() => setPaymentDialog(null)}
          onSaved={load}
        />
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

function EmptyHistory({ message }: { message: string }) {
  return (
    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
      {message}
    </div>
  );
}
