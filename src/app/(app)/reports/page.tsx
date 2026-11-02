"use client";

import { Defaulters } from "@/components/fees/Defaulters";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, Hero, Panel, StatusBadge, NameCell, inputClass } from "@/components/ui";
import { PrintIcon } from "@/components/Icons";
import { DocumentSigns, SchoolHead } from "@/components/print/PrintShell";
import type { DocumentSignatureUrls } from "@/lib/documentSignatures";
import { formatNumber, fullName, labelOfClass, photoSrc, prettyDate } from "@/lib/types";

type SchoolProfile = { schoolName: string; campus?: string; logoUrl?: string; motto?: string; principalName?: string; address?: string; phone?: string; email?: string; website?: string; boardName?: string; signatures?: DocumentSignatureUrls };

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
    dateOfBirth?: string;
    photoUpdatedAt?: string;
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
  const [generatedAt, setGeneratedAt] = useState("");
  const [classes, setClasses] = useState<{ _id: string; name: string; section: string }[]>([]);
  const [classId, setClassId] = useState("all");
  const [examType, setExamType] = useState("final");
  const [students, setStudents] = useState<{ _id: string; firstName: string; lastName: string; admissionNo: string }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [school, setSchool] = useState<SchoolProfile>({ schoolName: "School" });

  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString("en-GB"));
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          const branches = Array.isArray(d.settings.branches) ? d.settings.branches : [];
          const branch = branches.find((item: { code?: string }) => item.code === d.settings.defaultBranchCode)
            || (branches.length === 1 ? branches[0] : undefined);
          setSchool({
            schoolName: d.settings.schoolName,
            campus: branch?.name,
            logoUrl: d.settings.logoUrl,
            motto: d.settings.motto,
            principalName: d.settings.principalName,
            address: branch?.address || d.settings.address,
            phone: branch?.phone || d.settings.phone,
            email: branch?.email || d.settings.email,
            website: d.settings.website,
            boardName: d.settings.boardName,
            signatures: d.settings.signatures,
          });
        }
      })
      .catch(() => undefined);
  }, []);

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

      <div className={`print-only${type === "result-cards" ? " no-print" : ""}`} style={{ marginBottom: 16 }}>
        <SchoolHead
          school={{
            name: school.schoolName,
            campus: school.campus,
            logoUrl: school.logoUrl,
            address: school.address,
            phone: school.phone,
            email: school.email,
            website: school.website,
          }}
          title={REPORTS.find((r) => r.id === type)?.label || "REPORT"}
          sub={generatedAt || undefined}
        />
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {results
            ? ` · ${(results.cards || []).length} cards · ${results.examType || "All exams"} · ${results.class?.name || "All classes"}${
                results.class?.section ? `-${results.class.section}` : ""
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
            <div className="result-cards reports-result-cards print-pages">
              {results.cards.map((card) => (
                <ResultCardView key={`${card.student._id}-${card.classLabel || ""}`} card={card} meta={results} school={school} />
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
        ) : type === "fees" ? (
          // Loads its own data (one row per student, with WhatsApp reminders).
          <Defaulters bare />
        ) : !rows.length ? (
          <EmptyState message="No rows for this report yet." />
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
  school,
}: {
  card: ResultCard & { classLabel?: string; academicYear?: string };
  meta: ResultData;
  school: SchoolProfile;
}) {
  const classLine =
    card.classLabel ||
    `${meta.class.name}${meta.class.section ? `-${meta.class.section}` : ""}`;
  const year = card.academicYear || meta.class.academicYear;
  const examLabel = meta.examType && meta.examType !== "all"
    ? meta.examType.charAt(0).toUpperCase() + meta.examType.slice(1)
    : "Annual";
  const classCards = meta.cards.filter(
    (candidate) => (candidate.classLabel || classLine) === classLine
  );
  const completedCards = classCards.filter(
    (item) => item.subjects.length > 0 && item.subjects.every((subject) => subject.obtained != null)
  );
  const classAverage = completedCards.length
    ? Math.round((completedCards.reduce((sum, item) => sum + item.percentage, 0) / completedCards.length) * 10) / 10
    : 0;
  const classHighest = completedCards.length
    ? Math.max(...completedCards.map((item) => item.percentage))
    : 0;
  const positionLabel = card.position
    ? `${ordinal(card.position)} of ${classCards.length}`
    : "—";

  const shareText =
    `${school.schoolName}\n` +
    `Result Card — ${examLabel} ${year}\n` +
    `Student: ${card.student.name}  Roll No: ${card.student.rollNumber || "—"}\n` +
    `Class: ${classLine}\n` +
    `Total: ${card.totalObtained}/${card.totalMax} (${card.percentage}%) — ${card.result}\n` +
    (card.position ? `Position: ${card.position}\n` : "");

  const waLink = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
  const mailLink = `mailto:?subject=${encodeURIComponent(`Result Card – ${card.student.name}`)}&body=${encodeURIComponent(shareText)}`;
  const photoUrl = photoSrc("student", card.student);
  const initials = card.student.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  return (
    <article className="result-card doc-page result-card-doc reports-result-card rc2" id={`rca-${card.student._id}`}>
      {/* Per-card share toolbar — hidden on print */}
      <div className="result-card-actions no-print">
        <button type="button" className="link-btn" onClick={() => {
          const article = document.getElementById(`rca-${card.student._id}`);
          if (!article) { window.print(); return; }
          article.classList.add("print-target");
          document.body.classList.add("printing-one");
          window.print();
          document.body.classList.remove("printing-one");
          article.classList.remove("print-target");
        }}>Print this card</button>
        <a href={waLink} target="_blank" rel="noreferrer" className="link-btn" style={{ color: "#22c55e" }}>WhatsApp</a>
        <a href={mailLink} className="link-btn">Email</a>
      </div>

      <SchoolHead
        school={{
          name: school.schoolName,
          logoUrl: school.logoUrl,
          address: school.address,
          phone: school.phone,
          email: school.email,
          website: school.website,
        }}
        title="RESULT CARD"
        sub={`${examLabel} · ${year}`}
      />
      <div className="rc2-band">
        <b>Progress Report</b>
        <span>{[examLabel, year].filter(Boolean).join(" · ")}</span>
      </div>

      <div className="rc2-profile">
        <div className="stu-photo">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={card.student.name} />
          ) : (
            <span>{initials || "?"}</span>
          )}
        </div>
        <div className="rc2-who">
          <h2>{card.student.name}</h2>
          <dl>
            <div><dt>Father / Guardian</dt><dd>{card.student.parentName || "—"}</dd></div>
            <div><dt>Class</dt><dd>{classLine}</dd></div>
            <div><dt>Roll No.</dt><dd>{card.student.rollNumber || "—"}</dd></div>
            <div><dt>Admission No.</dt><dd>{card.student.admissionNo}</dd></div>
            <div><dt>Session</dt><dd>{year || "—"}</dd></div>
            <div><dt>Date of Birth</dt><dd>{card.student.dateOfBirth ? prettyDate(card.student.dateOfBirth) : "—"}</dd></div>
          </dl>
        </div>
        <div className={`rc2-badge ${card.result === "PASS" ? "pass" : card.result === "FAIL" ? "fail" : ""}`}>
          <span>Result</span>
          <b>{card.result}</b>
          {card.position ? <small>{positionLabel}</small> : null}
        </div>
      </div>

      {card.subjects.length ? (
        <div className="rc2-table-wrap">
          <table className="rc2-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th className="num">Max</th>
                <th className="num">Obtained</th>
                <th className="rc2-bar-h">Score</th>
                <th className="num">Grade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {card.subjects.map((subject) => {
                const status = subject.obtained == null
                  ? "pending"
                  : subject.percent < 40
                    ? "fail"
                    : "pass";
                return (
                  <tr key={subject.code + subject.name} className={status === "fail" ? "rc-fail" : ""}>
                    <td><b>{subject.name}</b></td>
                    <td className="num">{subject.maxMarks}</td>
                    <td className="num"><b>{subject.obtained ?? "—"}</b></td>
                    <td className="rc2-bar">
                      {status === "pending" ? "—" : (
                        <>
                          <i style={{ width: `${Math.max(0, Math.min(100, subject.percent))}%` }} />
                          <span>{subject.percent}%</span>
                        </>
                      )}
                    </td>
                    <td className="num"><b>{subject.grade}</b></td>
                    <td><span className={`rc2-st ${status}`}>{status === "pending" ? "Pending" : status === "fail" ? "Fail" : "Pass"}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Grand Total</b></td>
                <td className="num"><b>{card.totalMax}</b></td>
                <td className="num"><b>{card.totalObtained}</b></td>
                <td className="rc2-bar">
                  <i style={{ width: `${Math.max(0, Math.min(100, card.percentage))}%` }} />
                  <span>{card.percentage}%</span>
                </td>
                <td className="num"><b>{card.grade}</b></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rc2-remarks">
          <b>Result status</b>
          <p>No graded exam subjects found for this student.</p>
        </div>
      )}

      <div className="rc2-tiles">
        <div><span>Marks</span><b>{card.totalObtained} / {card.totalMax}</b></div>
        <div><span>Percentage</span><b>{card.percentage}%</b></div>
        <div><span>Grade</span><b>{card.grade}</b></div>
        {card.gpa != null ? <div><span>GPA</span><b>{card.gpa.toFixed(2)}</b></div> : null}
        <div><span>Position</span><b>{positionLabel}</b></div>
        <div><span>Class average</span><b>{classAverage}%</b></div>
        <div><span>Highest in class</span><b>{classHighest}%</b></div>
      </div>
      <div className="rc2-remarks">
        <b>Teacher&apos;s remarks</b>
        <p>No teacher remarks recorded.</p>
      </div>
      <div className="rc-scale">Grading: A+ 80%+ · A 70–79 · B 60–69 · C 50–59 · D 40–49 · F below 40</div>
      <DocumentSigns
        signatures={school.signatures}
        signers={[
          { label: "Class Teacher", role: "classTeacher" },
          { label: school.principalName || "Principal", role: "principal" },
          { label: "Parent / Guardian" },
        ]}
      />
    </article>
  );
}

function ordinal(value: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const lastTwo = value % 100;
  return `${value}${suffixes[(lastTwo - 20) % 10] || suffixes[lastTwo] || suffixes[0]}`;
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
