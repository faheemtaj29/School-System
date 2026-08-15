"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Hero, Panel, StatusBadge, NameCell, inputClass } from "@/components/ui";
import { PrintIcon } from "@/components/Icons";
import { formatNumber, fullName, labelOfClass, prettyDate } from "@/lib/types";

const REPORTS = [
  { id: "overview", label: "Overview" },
  { id: "result-cards", label: "Result Cards" },
  { id: "transcript", label: "Transcript / CGPA" },
  { id: "students", label: "Students by Class" },
  { id: "classes", label: "Class Strength" },
  { id: "fees", label: "Fee Defaulters" },
  { id: "attendance", label: "Attendance" },
  { id: "exams", label: "Exams" },
  { id: "staff", label: "Staff Directory" },
  { id: "finance", label: "Finance Snapshot" },
  { id: "inventory", label: "Inventory" },
] as const;

type ResultCard = {
  student: {
    _id: string;
    name: string;
    admissionNo: string;
    rollNumber: string;
    parentName: string;
  };
  subjects: {
    name: string;
    code: string;
    maxMarks: number;
    obtained: number | null;
    percent: number;
    grade: string;
  }[];
  totalMax: number;
  totalObtained: number;
  percentage: number;
  gpa?: number;
  grade: string;
  result: string;
  position: number;
};

type ResultData = {
  class: { name: string; section: string; academicYear: string };
  examType: string;
  examCount: number;
  cardCount?: number;
  classCount?: number;
  batch?: boolean;
  cards: (ResultCard & { classLabel?: string; academicYear?: string })[];
};

const EXAM_TYPES = ["", "midterm", "final", "quiz", "assignment"];

export default function ReportsPage() {
  const [type, setType] = useState<(typeof REPORTS)[number]["id"]>("overview");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<{ _id: string; name: string; section: string }[]>([]);
  const [classId, setClassId] = useState("all");
  const [examType, setExamType] = useState("final");
  const [students, setStudents] = useState<{ _id: string; firstName: string; lastName: string; admissionNo: string }[]>([]);
  const [studentId, setStudentId] = useState("");

  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []))
      .catch(() => undefined);
    fetch("/api/students")
      .then((r) => r.json())
      .then((d) => setStudents(d.students || []))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (type === "result-cards") {
        params.set("classId", classId || "all");
        if (examType) params.set("examType", examType);
      }
      if (type === "transcript" && studentId) {
        params.set("studentId", studentId);
      }
      if (type === "transcript" && !studentId) {
        setData(null);
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/reports?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [type, classId, examType, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const results = (data?.data as ResultData | undefined) ?? null;

  const rows = (data?.rows as Record<string, unknown>[]) || [];
  const finance = data?.data as Record<string, unknown> | undefined;

  return (
    <>
      <Hero
        title="Reports & Print"
        subtitle="Generate printable campus reports from live data"
        actionLabel={type === "result-cards" ? "Print All Cards" : "Print Report"}
        actionIcon={<PrintIcon />}
        onAction={() => window.print()}
      />

      <div className="chips no-print" style={{ marginBottom: 18 }}>
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`filter-chip${type === r.id ? " active" : ""}`}
            onClick={() => setType(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {type === "transcript" ? (
        <Panel title="Official transcript" meta="GPA / CGPA">
          <div className="chips no-print" style={{ marginBottom: 14 }}>
            <select
              className={inputClass}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              <option value="">Select student</option>
              {students.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.admissionNo} — {s.firstName} {s.lastName}
                </option>
              ))}
            </select>
          </div>
          {!studentId ? (
            <EmptyState message="Choose a student to build their transcript and CGPA." />
          ) : loading ? (
            <EmptyState message="Loading transcript…" />
          ) : !(data?.data as { student?: { name: string } } | undefined)?.student ? (
            <EmptyState message={(data as { error?: string } | null)?.error || "No transcript data"} />
          ) : (
            (() => {
              const t = data!.data as {
                student: { name: string; admissionNo: string };
                cgpa: number;
                totalCredits: number;
                terms: {
                  label: string;
                  gpa: number;
                  credits: number;
                  rows: {
                    subject: string;
                    code: string;
                    credits: number;
                    obtained: number;
                    maxMarks: number;
                    grade: string;
                    points: number;
                  }[];
                }[];
              };
              return (
                <div className="stack">
                  <p>
                    <strong>{t.student.name}</strong> · {t.student.admissionNo} · CGPA{" "}
                    <strong>{t.cgpa.toFixed(2)}</strong> · {t.totalCredits} credits
                  </p>
                  {t.terms.map((term) => (
                    <div key={term.label} style={{ marginBottom: 18 }}>
                      <h3 style={{ margin: "0 0 8px" }}>
                        {term.label} · GPA {term.gpa.toFixed(2)}
                      </h3>
                      <table className="reg">
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th>Cr</th>
                            <th>Marks</th>
                            <th>Grade</th>
                            <th>GP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {term.rows.map((row, i) => (
                            <tr key={`${row.code}-${i}`}>
                              <td>
                                {row.subject}
                                <div className="muted small">{row.code}</div>
                              </td>
                              <td>{row.credits}</td>
                              <td>
                                {row.obtained}/{row.maxMarks}
                              </td>
                              <td>{row.grade}</td>
                              <td>{row.points.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </Panel>
      ) : null}

      {type === "result-cards" ? (
        <>
          <div className="pay-stat-row no-print">
            <div className="pay-stat">
              <div className="tag">Cards Ready</div>
              <div className="num">{results?.cards?.length ?? 0}</div>
            </div>
            <div className="pay-stat">
              <div className="tag">Classes</div>
              <div className="num">{results?.classCount ?? (results ? 1 : 0)}</div>
            </div>
            <div className="pay-stat">
              <div className="tag">Exam Papers Used</div>
              <div className="num">{results?.examCount ?? 0}</div>
            </div>
          </div>
          <p className="no-print" style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-dim)" }}>
            Fully automated — subjects, marks, grades, % and positions come from{" "}
            <strong>Exams & Results</strong>. Do not re-enter marks here. Select a class or All Classes,
            then Print All Cards.
          </p>
          <div className="chips no-print" style={{ marginBottom: 18 }}>
            <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="all">All classes — campus batch</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} — {c.section}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
            >
              {EXAM_TYPES.map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? `${value[0].toUpperCase()}${value.slice(1)} exams` : "All exams combined"}
                </option>
              ))}
            </select>
            <button type="button" className="btn-dark" onClick={() => window.print()}>
              Print All Cards
            </button>
          </div>
        </>
      ) : null}

      <div className="print-only" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20 }}>Sabaq — {REPORTS.find((r) => r.id === type)?.label}</h2>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Generated {new Date().toLocaleString()}
          {results
            ? ` · ${results.cards.length} cards · ${results.examType} · ${results.class.name}${
                results.class.section ? `-${results.class.section}` : ""
              }`
            : ""}
        </div>
      </div>

      <Panel title={REPORTS.find((r) => r.id === type)?.label} meta={loading ? "LOADING…" : "LIVE DATA"}>
        {loading ? (
          <EmptyState message="Building result cards from exam marks…" />
        ) : type === "result-cards" ? (
          !results?.cards?.length ? (
            <EmptyState message="No active students (or no graded exams) for this selection. Enter marks under Exams & Results first." />
          ) : (
            <div className="result-cards">
              {results.cards.map((card) => (
                <ResultCardView key={`${card.student._id}-${card.classLabel || ""}`} card={card} meta={results} />
              ))}
            </div>
          )
        ) : type === "finance" || type === "overview" ? (
          <div>
            {type === "overview" && finance ? (
              <>
                <div className="pay-stat-row">
                  <div className="pay-stat">
                    <div className="tag">Fee Billed</div>
                    <div className="num">
                      {formatNumber(((finance.finance as { fees?: { billed?: number } })?.fees?.billed) ?? 0)}
                    </div>
                  </div>
                  <div className="pay-stat">
                    <div className="tag">Fee Collected</div>
                    <div className="num">
                      {formatNumber(((finance.finance as { fees?: { collected?: number } })?.fees?.collected) ?? 0)}
                    </div>
                  </div>
                  <div className="pay-stat">
                    <div className="tag">Classes Tracked</div>
                    <div className="num">{((finance.classes as unknown[]) || []).length}</div>
                  </div>
                </div>
                <h3 style={{ fontSize: 15, margin: "12px 0" }}>Class Strength</h3>
                <ClassRows rows={(finance.classes as Record<string, unknown>[]) || []} />
              </>
            ) : null}
            {type === "finance" && (data?.data as Record<string, unknown>) ? (
              <FinanceBlock data={data!.data as Record<string, unknown>} />
            ) : null}
          </div>
        ) : !rows.length ? (
          <EmptyState message="No rows for this report yet." />
        ) : type === "fees" ? (
          <FeeRows rows={rows} />
        ) : type === "attendance" ? (
          <AttRows rows={rows} />
        ) : type === "staff" ? (
          <StaffRows rows={rows} />
        ) : type === "inventory" ? (
          <InvRows rows={rows} />
        ) : type === "exams" ? (
          <ExamRows rows={rows} />
        ) : (
          <GenericRows rows={rows} />
        )}
      </Panel>
    </>
  );
}

function ResultCardView({
  card,
  meta,
}: {
  card: ResultCard & { classLabel?: string; academicYear?: string };
  meta: ResultData;
}) {
  const classLine =
    card.classLabel ||
    `${meta.class.name}${meta.class.section ? `-${meta.class.section}` : ""}`;
  const year = card.academicYear || meta.class.academicYear;

  return (
    <article className="result-card doc-sheet">
      <header className="result-card-head doc-sheet-head">
        <div>
          <h3>Sabaq School System</h3>
          <p>
            Result Card · {classLine} · {year}
            {meta.examType && meta.examType !== "all" ? ` · ${meta.examType}` : ""}
          </p>
        </div>
        <div className="result-card-grade">
          <span>Grade</span>
          <strong>{card.grade}</strong>
        </div>
      </header>

      <div className="result-card-meta">
        <div>
          <span>Student</span>
          <strong>{card.student.name}</strong>
        </div>
        <div>
          <span>Admission No</span>
          <strong>{card.student.admissionNo}</strong>
        </div>
        <div>
          <span>Roll No</span>
          <strong>{card.student.rollNumber || "—"}</strong>
        </div>
        <div>
          <span>Father / Guardian</span>
          <strong>{card.student.parentName || "—"}</strong>
        </div>
      </div>

      {!card.subjects.length ? (
        <EmptyState message="No graded exam subjects found for this student." />
      ) : (
        <table className="reg">
          <thead>
            <tr>
              <th>Subject</th>
              <th className="right">Max</th>
              <th className="right">Obtained</th>
              <th className="right">%</th>
              <th className="right">Grade</th>
            </tr>
          </thead>
          <tbody>
            {card.subjects.map((subject) => (
              <tr key={subject.code + subject.name}>
                <td>{subject.name}</td>
                <td className="num">{subject.maxMarks}</td>
                <td className="num">{subject.obtained ?? "—"}</td>
                <td className="num">
                  {subject.obtained == null ? "—" : `${subject.percent}%`}
                </td>
                <td className="num">{subject.grade}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td>
                <strong>TOTAL</strong>
              </td>
              <td className="num">
                <strong>{card.totalMax}</strong>
              </td>
              <td className="num">
                <strong>{card.totalObtained}</strong>
              </td>
              <td className="num">
                <strong>{card.percentage}%</strong>
              </td>
              <td className="num">
                <strong>{card.grade}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="result-card-foot">
        <span>
          Position: <strong>{card.position || "—"}</strong>
        </span>
        <span>
          GPA: <strong>{card.gpa != null ? card.gpa.toFixed(2) : "—"}</strong>
        </span>
        <span>
          Result: <strong>{card.result}</strong>
        </span>
        <span>Class Teacher</span>
        <span>Principal</span>
      </div>
    </article>
  );
}

function ClassRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Class</th>
          <th>Room</th>
          <th className="right">Capacity</th>
          <th className="right">Enrolled</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td style={{ fontWeight: 600 }}>{String(r.name)}-{String(r.section)}</td>
            <td>{String(r.room || "—")}</td>
            <td className="num">{String(r.capacity ?? "—")}</td>
            <td className="num">{String(r.enrolled ?? r.count ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GenericRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Label</th>
          <th className="right">Count</th>
          <th className="right">Active</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{String(r.className || r.label || "—")}</td>
            <td className="num">{String(r.count ?? r.enrolled ?? 0)}</td>
            <td className="num">{String(r.active ?? "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FeeRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Student</th>
          <th>Title</th>
          <th>Due</th>
          <th className="right">Balance</th>
          <th className="right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const s = r.studentId as { firstName?: string; lastName?: string; classId?: unknown } | string;
          const student = typeof s === "object" && s ? s : null;
          const amount = Number(r.amount || 0);
          const paid = Number(r.paidAmount || 0);
          return (
            <tr key={String(r._id)}>
              <td>
                <NameCell
                  name={student ? `${student.firstName} ${student.lastName}` : "—"}
                  sub={student ? labelOfClass(student.classId as never) : undefined}
                />
              </td>
              <td>{String(r.title)}</td>
              <td>{prettyDate(r.dueDate as string)}</td>
              <td className="num">{formatNumber(amount - paid)}</td>
              <td className="right"><StatusBadge status={String(r.status)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AttRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Date</th>
          <th>Class</th>
          <th className="right">Present</th>
          <th className="right">Rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td>{prettyDate(r.date as string)}</td>
            <td>{labelOfClass(r.classId as never)}</td>
            <td className="num">{String(r.present)}/{String(r.total)}</td>
            <td className="right"><span className="badge present">{String(r.rate)}%</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StaffRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Staff</th>
          <th>Employee ID</th>
          <th>Email</th>
          <th className="right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td>
              <NameCell name={fullName({ firstName: String(r.firstName), lastName: String(r.lastName) })} />
            </td>
            <td className="num">{String(r.employeeId)}</td>
            <td>{String(r.email)}</td>
            <td className="right"><StatusBadge status={String(r.status)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExamRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Exam</th>
          <th>Class</th>
          <th>Subject</th>
          <th>Date</th>
          <th className="right">Results</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td style={{ fontWeight: 600 }}>{String(r.title)}</td>
            <td>{labelOfClass(r.classId as never)}</td>
            <td>{typeof r.subjectId === "object" && r.subjectId ? String((r.subjectId as { name: string }).name) : "—"}</td>
            <td>{prettyDate(r.date as string)}</td>
            <td className="num">{Array.isArray(r.results) ? r.results.length : 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Item</th>
          <th>Category</th>
          <th className="right">Qty</th>
          <th className="right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td className="num">{String(r.sku)}</td>
            <td>{String(r.name)}</td>
            <td>{String(r.category)}</td>
            <td className="num">{String(r.quantity)} {String(r.unit)}</td>
            <td className="right"><StatusBadge status={String(r.status)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FinanceBlock({ data }: { data: Record<string, unknown> }) {
  const fees = (data.fees || {}) as { billed?: number; collected?: number };
  const ledger = (data.ledger || {}) as { income?: number; expense?: number; balance?: number };
  const payroll = (data.payroll || {}) as { paid?: number; pending?: number };
  return (
    <div className="pay-stat-row">
      <div className="pay-stat"><div className="tag">Fees Billed</div><div className="num">{formatNumber(fees.billed ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Fees Collected</div><div className="num">{formatNumber(fees.collected ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Ledger Income</div><div className="num">{formatNumber(ledger.income ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Ledger Expense</div><div className="num">{formatNumber(ledger.expense ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Ledger Balance</div><div className="num">{formatNumber(ledger.balance ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Payroll Paid</div><div className="num">{formatNumber(payroll.paid ?? 0)}</div></div>
    </div>
  );
}
