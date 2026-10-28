"use client";

import { AdvanceFeeModal } from "@/components/fees/FeeTools";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Panel, StatusBadge } from "@/components/ui";
import { PersonPhoto } from "@/components/PersonPhoto";
import { formatNumber, prettyDate, toDateInput } from "@/lib/types";

/* ── types (shape of /api/students/[id]/profile) ─────────────────── */
type Status = "present" | "absent" | "late" | "excused";
type Student = {
  _id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  address?: string;
  rollNumber?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  admissionDate?: string;
  createdAt?: string;
  status: string;
  cnic?: string;
  nationality?: string;
  religion?: string;
  previousSchool?: string;
  discountType?: string;
  discountPercent?: number;
  tcNo?: string;
  tcIssuedDate?: string;
  leavingDate?: string;
  leavingReason?: string;
  conductRemark?: string;
  photoUrl: string | null;
  classId?: { _id: string; name: string; section?: string; room?: string } | null;
};
type LedgerRow = { date: string; number: string; description: string; debit: number; credit: number; balance: number; kind: string; feeId: string };
type Card = {
  termId: string;
  classId: string;
  term: string;
  academicYear: string;
  date: string;
  classLabel: string;
  totalMarks: number;
  obtained: number;
  percent: number;
  grade: string;
  result: string;
  position: number;
  outOf: number;
  subjects: { name: string; obtained: number; totalMarks: number; grade: string; status: string }[];
};
type Profile = {
  student: Student;
  currency: string;
  ledger: {
    rows: LedgerRow[];
    totalDebit: number;
    totalCredit: number;
    balance: number;
    challans: { _id: string; title: string; billingMonth: string; dueDate: string; amount: number; paidAmount: number; status: string }[];
  };
  attendance: {
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    percent: number | null;
    months: { month: string; present: number; absent: number; late: number; excused: number }[];
    days: { date: string; status: Status; note: string }[];
  };
  results: { cards: Card[]; tests: { _id: string; date: string; title: string; subject: string; marks: number; maxMarks: number; grade: string }[] };
  timeline: { date: string; kind: string; title: string; detail?: string }[];
  viewer: { role: string };
};

type Tab = "overview" | "record" | "attendance" | "fees" | "results";

const STATUS_LABEL: Record<Status, string> = { present: "P", absent: "A", late: "L", excused: "E" };
const KIND_ICON: Record<string, string> = { admission: "🎓", fee: "🧾", payment: "💵", result: "📊", absent: "✕", tc: "📄" };

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="tp-info">
      <span>{label}</span>
      <b>{value === undefined || value === null || value === "" ? "—" : value}</b>
    </div>
  );
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/* ══════════════════════════════════════════════════════════════════ */
/**
 * A student's full profile. Staff open it from Students; parents and students see the same
 * screen read-only in their portal (`portal`), with challans and receipts to print.
 */
export function StudentProfileView({ id, portal = false }: { id: string; portal?: boolean }) {
  const [data, setData] = useState<Profile | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [marking, setMarking] = useState("");

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch(`/api/students/${id}/profile`);
    const d = await res.json();
    if (!res.ok) return setErr(d.error || "Could not load the student");
    setData(d);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    load();
  }, [load]);

  const byDay = useMemo(
    () => new Map((data?.attendance.days || []).map((d) => [new Date(d.date).toISOString().slice(0, 10), d])),
    [data]
  );

  if (err) return <EmptyState message={err} />;
  if (!data) return <div className="tp-loading">Loading student profile…</div>;

  const s = data.student;
  const name = `${s.firstName} ${s.lastName}`;
  const cur = data.currency;
  const cls = s.classId ? `${s.classId.name}${s.classId.section ? ` – ${s.classId.section}` : ""}` : "—";
  const canMark = data.viewer.role === "admin" || data.viewer.role === "teacher";
  const canPhoto = data.viewer.role !== "student" && data.viewer.role !== "parent";
  const latest = data.results.cards[0];

  async function mark(date: string, status: Status) {
    setMarking(date);
    const res = await fetch(`/api/students/${id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, status }),
    });
    const d = await res.json();
    setMarking("");
    if (res.ok && data) setData({ ...data, attendance: d.attendance });
  }

  // Calendar for the chosen month (Monday first).
  const [cy, cm] = month.split("-").map(Number);
  const first = new Date(Date.UTC(cy, cm - 1, 1));
  const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const today = toDateInput(new Date());
  const cells = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const monthStats = data.attendance.months.find((m) => m.month === month);

  return (
    <>
      {!portal ? (
        <div className="no-print" style={{ marginBottom: 10 }}>
          <Link href="/students" className="link-btn">← Students</Link>
        </div>
      ) : null}

      {/* ── header ─────────────────────────────────────────────── */}
      <section className="tp-hero">
        <PersonPhoto
          kind="student"
          id={s._id}
          url={s.photoUrl}
          name={name}
          editable={canPhoto}
          onChanged={(url) => setData({ ...data, student: { ...s, photoUrl: url } })}
        />
        <div className="tp-hero-main">
          <h1>{name}</h1>
          <p>
            {cls}
            {s.rollNumber ? ` · Roll no. ${s.rollNumber}` : ""}
            {s.parentName ? ` · ${s.gender === "female" ? "D/o" : "S/o"} ${s.parentName}` : ""}
          </p>
          <div className="tp-tags">
            <span>Adm. {s.admissionNo}</span>
            <span>Admitted {prettyDate(s.admissionDate || s.createdAt || "")}</span>
            {s.discountType && s.discountType !== "none" ? (
              <span>Concession: {s.discountType.replace(/_/g, " ")}{s.discountPercent ? ` ${s.discountPercent}%` : ""}</span>
            ) : null}
            <StatusBadge status={s.status} />
          </div>
        </div>
        <div className="tp-hero-stats">
          <div><small>Attendance</small><b>{data.attendance.percent === null ? "—" : `${data.attendance.percent}%`}</b></div>
          <div><small>Latest result</small><b>{latest ? `${latest.percent}% · ${latest.grade}` : "—"}</b></div>
          <div><small>Fee balance</small><b>{cur} {formatNumber(data.ledger.balance)}</b></div>
          <div><small>Days absent</small><b>{data.attendance.absent}</b></div>
        </div>
      </section>

      <div className="chips no-print" style={{ margin: "14px 0" }}>
        {(
          [
            ["overview", "Profile"],
            ["record", "Track record"],
            ["attendance", "Attendance"],
            ["fees", "Fee ledger"],
            ["results", `Results (${data.results.cards.length || data.results.tests.length})`],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" className={`filter-chip${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {/* ── profile ─────────────────────────────────────────────── */}
      {tab === "overview" ? (
        <div className="tp-grid">
          <Panel title="Personal">
            <Info label="Full name" value={name} />
            <Info label="Gender" value={s.gender} />
            <Info label="Date of birth" value={s.dateOfBirth ? prettyDate(s.dateOfBirth) : ""} />
            <Info label="B-Form / CNIC" value={s.cnic} />
            <Info label="Nationality" value={s.nationality} />
            <Info label="Religion" value={s.religion} />
            <Info label="Address" value={s.address} />
          </Panel>
          <Panel title="Guardian / Parent">
            <Info label="Name" value={s.parentName} />
            <Info label="Phone" value={s.parentPhone} />
            <Info label="Email" value={s.parentEmail} />
            <Info label="Student phone" value={s.phone} />
            <Info label="Student email" value={s.email} />
          </Panel>
          <Panel title="School">
            <Info label="Admission no." value={s.admissionNo} />
            <Info label="Admission date" value={prettyDate(s.admissionDate || s.createdAt || "")} />
            <Info label="Class" value={cls} />
            <Info label="Roll no." value={s.rollNumber} />
            <Info label="Previous school" value={s.previousSchool} />
            <Info label="Status" value={s.status} />
          </Panel>
          {s.tcNo ? (
            <Panel title="Transfer Certificate">
              <Info label="TC no." value={s.tcNo} />
              <Info label="Issued" value={s.tcIssuedDate ? prettyDate(s.tcIssuedDate) : ""} />
              <Info label="Leaving date" value={s.leavingDate ? prettyDate(s.leavingDate) : ""} />
              <Info label="Reason" value={s.leavingReason} />
              <Info label="Conduct" value={s.conductRemark} />
            </Panel>
          ) : null}
        </div>
      ) : null}

      {/* ── track record ───────────────────────────────────────── */}
      {tab === "record" ? (
        <Panel title="Track Record" meta={`${data.timeline.length} EVENTS`}>
          {!data.timeline.length ? (
            <EmptyState message="Nothing recorded yet." />
          ) : (
            <ol className="sp-timeline">
              {data.timeline.map((t, i) => (
                <li key={i} className={`sp-tl-${t.kind}`}>
                  <span className="sp-tl-dot">{KIND_ICON[t.kind] || "•"}</span>
                  <div>
                    <b>{t.title}</b>
                    {t.detail ? <span>{t.detail}</span> : null}
                  </div>
                  <time>{prettyDate(t.date)}</time>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      ) : null}

      {/* ── attendance ─────────────────────────────────────────── */}
      {tab === "attendance" ? (
        <>
          <div className="pay-stat-row">
            <div className="pay-stat"><div className="tag">Days marked</div><div className="num">{data.attendance.total}</div></div>
            <div className="pay-stat"><div className="tag">Present</div><div className="num" style={{ color: "var(--jade-dark)" }}>{data.attendance.present}</div></div>
            <div className="pay-stat"><div className="tag">Late</div><div className="num" style={{ color: "#96650f" }}>{data.attendance.late}</div></div>
            <div className="pay-stat"><div className="tag">Absent</div><div className="num" style={{ color: "var(--red)" }}>{data.attendance.absent}</div></div>
            <div className="pay-stat"><div className="tag">Leave</div><div className="num">{data.attendance.excused}</div></div>
          </div>
          <div className="tp-grid">
            <Panel title={monthLabel(month)} meta={monthStats ? `P ${monthStats.present} · A ${monthStats.absent} · L ${monthStats.late}` : "NO RECORD"}>
              <div className="chips no-print" style={{ marginBottom: 10 }}>
                <button type="button" className="filter-chip" onClick={() => setMonth(toDateInput(new Date(Date.UTC(cy, cm - 2, 1))).slice(0, 7))}>‹ Previous</button>
                <button type="button" className="filter-chip" onClick={() => setMonth(new Date().toISOString().slice(0, 7))}>This month</button>
                <button type="button" className="filter-chip" onClick={() => setMonth(toDateInput(new Date(Date.UTC(cy, cm, 1))).slice(0, 7))}>Next ›</button>
              </div>
              <div className="sp-cal">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="sp-cal-h">{d}</div>)}
                {cells.map((day, i) => {
                  if (!day) return <div key={`x${i}`} />;
                  const rec = byDay.get(day);
                  const future = day > today;
                  return (
                    <div key={day} className={`sp-cal-d${rec ? ` sp-${rec.status}` : ""}${day === today ? " sp-today" : ""}`} title={rec?.note || rec?.status || ""}>
                      <span>{Number(day.slice(8))}</span>
                      {rec ? <b>{STATUS_LABEL[rec.status]}</b> : null}
                      {canMark && !future ? (
                        <div className="sp-cal-mark no-print">
                          {(["present", "absent", "late", "excused"] as Status[]).map((st) => (
                            <button key={st} type="button" disabled={marking === day} onClick={() => mark(day, st)} title={st}>
                              {STATUS_LABEL[st]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <p className="coa-hint">
                P present · A absent · L late · E leave/excused.
                {canMark ? " Hover a day and click a letter to mark this student (class-wise marking is on the Attendance page)." : ""}
              </p>
            </Panel>
            <Panel title="Month by month" meta={`${data.attendance.months.length} MONTHS`}>
              {!data.attendance.months.length ? (
                <EmptyState message="No attendance marked yet." />
              ) : (
                <table className="reg report-table">
                  <thead>
                    <tr><th>Month</th><th className="right">P</th><th className="right">L</th><th className="right">A</th><th className="right">E</th><th className="right">%</th></tr>
                  </thead>
                  <tbody>
                    {data.attendance.months.map((m) => {
                      const total = m.present + m.late + m.absent + m.excused;
                      return (
                        <tr key={m.month} style={{ cursor: "pointer" }} onClick={() => setMonth(m.month)}>
                          <td>{monthLabel(m.month)}</td>
                          <td className="num">{m.present}</td>
                          <td className="num">{m.late}</td>
                          <td className="num">{m.absent}</td>
                          <td className="num">{m.excused}</td>
                          <td className="num">{total ? Math.round(((m.present + m.late) / total) * 100) : 0}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </>
      ) : null}

      {advanceOpen ? (
        <AdvanceFeeModal
          studentId={id}
          onClose={() => setAdvanceOpen(false)}
          onDone={() => {
            setAdvanceOpen(false);
            load();
          }}
        />
      ) : null}

      {/* ── fee ledger ─────────────────────────────────────────── */}
      {tab === "fees" ? (
        <Panel title="Fee Ledger" meta={`BALANCE ${cur} ${formatNumber(data.ledger.balance)}`}>
          <div className="chips no-print" style={{ marginBottom: 12 }}>
            <button type="button" className="btn-dark" onClick={() => window.open(`/print/student-ledger?student=${s._id}`, "_blank")}>
              Print fee ledger
            </button>
            {!portal ? (
              <>
                <Link href={`/fees?q=${encodeURIComponent(s.admissionNo)}`} className="btn-ghost">Collect fee / challans</Link>
                <button type="button" className="btn-ghost" onClick={() => setAdvanceOpen(true)}>Advance fee</button>
              </>
            ) : null}
          </div>
          {!data.ledger.rows.length ? (
            <EmptyState message="No fee challans yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg report-table pl-table">
                <thead>
                  <tr>
                    <th style={{ width: 170 }}>Voucher / receipt no.</th>
                    <th style={{ width: 110 }}>Date</th>
                    <th>Description</th>
                    <th className="right">Debit (charged)</th>
                    <th className="right">Credit (paid / concession)</th>
                    <th className="right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.rows.map((r, i) => (
                    <tr key={i}>
                      <td className="num">
                        {r.kind === "payment" ? (
                          <a href={`/print/fee-receipt?id=${r.feeId}&receiptNo=${encodeURIComponent(r.number)}`} target="_blank" rel="noreferrer" title="Print receipt">
                            {r.number}
                          </a>
                        ) : (
                          r.number
                        )}
                      </td>
                      <td>{prettyDate(r.date)}</td>
                      <td>{r.description}</td>
                      <td className="num">{r.debit ? formatNumber(r.debit) : ""}</td>
                      <td className="num">{r.credit ? formatNumber(r.credit) : ""}</td>
                      <td className="num">{formatNumber(r.balance)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}><strong>Total / balance due</strong></td>
                    <td className="num"><strong>{formatNumber(data.ledger.totalDebit)}</strong></td>
                    <td className="num"><strong>{formatNumber(data.ledger.totalCredit)}</strong></td>
                    <td className="num"><strong>{formatNumber(data.ledger.balance)}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "fees" && data.ledger.challans.length ? (
        <Panel title="Fee Challans" meta={`${data.ledger.challans.filter((c) => c.status !== "paid").length} UNPAID`}>
          <div className="table-scroll">
            <table className="reg report-table">
              <thead>
                <tr><th>Challan</th><th>Due date</th><th className="right">Amount</th><th className="right">Paid</th><th className="right">Status</th><th className="no-print" /></tr>
              </thead>
              <tbody>
                {data.ledger.challans.map((c) => (
                  <tr key={c._id}>
                    <td>{c.title}</td>
                    <td>{prettyDate(c.dueDate)}</td>
                    <td className="num">{formatNumber(c.amount)}</td>
                    <td className="num">{formatNumber(c.paidAmount)}</td>
                    <td className="right"><StatusBadge status={c.status} /></td>
                    <td className="no-print">
                      <a className="link-btn" href={`/print/fee-challans?ids=${c._id}&copies=${portal ? 1 : 3}`} target="_blank" rel="noreferrer">
                        Print challan
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {portal ? <p className="coa-hint">Print the challan and pay at the school office or the bank. Click a receipt number in the ledger above to print the receipt.</p> : null}
        </Panel>
      ) : null}

      {/* ── results ────────────────────────────────────────────── */}
      {tab === "results" ? (
        <>
          {!data.results.cards.length && !data.results.tests.length ? (
            <Panel title="Results"><EmptyState message="No results ready yet." /></Panel>
          ) : null}
          {data.results.cards.map((c) => (
            <Panel
              key={c.termId}
              title={`${c.term} · ${c.academicYear}`}
              meta={`${c.result} · ${c.percent}% · GRADE ${c.grade}${c.position ? ` · POSITION ${c.position}/${c.outOf}` : ""}`}
            >
              <div className="table-scroll">
                <table className="reg report-table">
                  <thead>
                    <tr><th>Subject</th><th className="right">Marks</th><th className="right">Out of</th><th className="right">Grade</th><th className="right">Status</th></tr>
                  </thead>
                  <tbody>
                    {c.subjects.map((sub) => (
                      <tr key={sub.name}>
                        <td>{sub.name}</td>
                        <td className="num">{sub.status === "absent" ? "ABS" : sub.obtained}</td>
                        <td className="num">{sub.totalMarks}</td>
                        <td className="num">{sub.grade}</td>
                        <td className="right"><span className={`sp-res sp-res-${sub.status}`}>{sub.status.toUpperCase()}</span></td>
                      </tr>
                    ))}
                    <tr className="total-row">
                      <td><strong>Total</strong></td>
                      <td className="num"><strong>{c.obtained}</strong></td>
                      <td className="num"><strong>{c.totalMarks}</strong></td>
                      <td className="num"><strong>{c.grade}</strong></td>
                      <td className="right"><strong>{c.result}</strong></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="link-btn no-print"
                onClick={() => window.open(`/print/result-cards?termId=${c.termId}&classIds=${c.classId}&student=${s._id}`, "_blank")}
              >
                Print result card
              </button>
            </Panel>
          ))}
          {data.results.tests.length && !data.results.cards.length ? (
            <Panel title="Tests" meta={`${data.results.tests.length} TESTS`}>
              <table className="reg report-table">
                <thead><tr><th>Date</th><th>Test</th><th>Subject</th><th className="right">Marks</th><th className="right">Grade</th></tr></thead>
                <tbody>
                  {data.results.tests.map((t) => (
                    <tr key={t._id}>
                      <td>{prettyDate(t.date)}</td>
                      <td>{t.title}</td>
                      <td>{t.subject}</td>
                      <td className="num">{t.marks} / {t.maxMarks}</td>
                      <td className="num">{t.grade || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}
        </>
      ) : null}
    </>
  );
}
