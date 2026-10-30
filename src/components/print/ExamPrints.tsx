"use client";

import { Fragment } from "react";
import { PrintShell, SchoolHead, chunk, fmtDate, fmtTime, usePrintData, type SchoolHeader } from "./PrintShell";

type Paper = {
  subject: string;
  code: string;
  examDate: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
};

type SlipData = {
  school: SchoolHeader;
  term: { name: string; academicYear: string };
  batches: {
    classId: string;
    classLabel: string;
    /** The class's campus letterhead. */
    head?: SchoolHeader;
    papers: Paper[];
    students: { _id: string; name: string; fatherName: string; admissionNo: string; rollNo: string; photoUrl?: string | null }[];
  }[];
};

function slipsUrl(termId: string, classIds: string) {
  return termId && classIds ? `/api/exams/center/slips?termId=${termId}&classIds=${classIds}` : null;
}

function PaperTable({ papers }: { papers: Paper[] }) {
  return (
    <table className="doc-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Subject</th>
          <th>Date</th>
          <th>Day</th>
          <th>Start</th>
          <th>End</th>
          <th>Invigilator sign</th>
        </tr>
      </thead>
      <tbody>
        {papers.map((p, i) => (
          <tr key={p.subject + i}>
            <td>{i + 1}</td>
            <td>
              <b>{p.subject}</b>
              {p.code ? <small> ({p.code})</small> : null}
            </td>
            <td>{fmtDate(p.examDate)}</td>
            <td>{p.day || "—"}</td>
            <td>{fmtTime(p.startTime)}</td>
            <td>{fmtTime(p.endTime)}</td>
            <td />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RollSlipsPrint({ termId, classIds, perPage }: { termId: string; classIds: string; perPage: number }) {
  const { data, error } = usePrintData<SlipData>(slipsUrl(termId, classIds));
  const slips = data?.batches.flatMap((b) => b.students.map((s) => ({ ...s, batch: b }))) || [];
  const asked = [1, 2, 3].includes(perPage) ? perPage : 2;
  // Three slips fit an A4 page only with a short date sheet; a long one goes two to a page.
  const mostPapers = Math.max(0, ...(data?.batches.map((b) => b.papers.length) || []));
  const per = asked === 3 && mostPapers > 6 ? 2 : asked;
  return (
    <PrintShell
      title="Roll Number Slips"
      info={
        data
          ? `${slips.length} slips · ${data.term.name} ${data.term.academicYear}` +
            (per !== asked ? ` · ${mostPapers} papers, so 2 slips per page` : "")
          : undefined
      }
      error={error}
      loading={!data}
    >
      {data
        ? chunk(slips, per).map((page, pi) => (
            <section key={pi} className={`doc-page slips-${per}`}>
              {page.map((s) => (
                <article key={s._id} className="slip">
                  <SchoolHead
                    school={s.batch.head || data.school}
                    title="ROLL NUMBER SLIP"
                    sub={`${data.term.name} · ${data.term.academicYear}`}
                  />
                  <div className="slip-info">
                    <div className="slip-roll">
                      <span>Roll No.</span>
                      <b>{s.rollNo || "—"}</b>
                    </div>
                    <dl>
                      <div><dt>Student</dt><dd>{s.name}</dd></div>
                      <div><dt>Father / Guardian</dt><dd>{s.fatherName || "—"}</dd></div>
                      <div><dt>Class</dt><dd>{s.batch.classLabel}</dd></div>
                      <div><dt>Admission No.</dt><dd>{s.admissionNo}</dd></div>
                    </dl>
                    <StudentPhoto url={s.photoUrl} name={s.name} small />
                  </div>
                  <PaperTable papers={s.batch.papers} />
                  <footer className="slip-foot">
                    <p>Bring this slip to every paper. Reach the hall 15 minutes before start time. Mobile phones are not allowed.</p>
                    <div className="signs">
                      <span>Class Teacher</span>
                      <span>Controller of Exams</span>
                      <span>Principal</span>
                    </div>
                  </footer>
                </article>
              ))}
            </section>
          ))
        : null}
    </PrintShell>
  );
}

export function DateSheetPrint({ termId, classIds, src }: { termId: string; classIds: string; src?: string }) {
  const { data, error } = usePrintData<SlipData>(src || slipsUrl(termId, classIds));
  return (
    <PrintShell title="Date Sheet" info={data ? `${data.batches.length} class(es)` : undefined} error={error} loading={!data} closable={!src}>
      {data?.batches.map((b) => {
        const dated = b.papers.filter((p) => p.examDate);
        const first = dated[0]?.examDate;
        const last = dated[dated.length - 1]?.examDate;
        return (
          <section key={b.classId} className="doc-page ds2">
            <SchoolHead school={b.head || data.school} title="DATE SHEET" sub={`${data.term.name} · ${data.term.academicYear}`} />
            <div className="rc2-band">
              <b>Date Sheet — {b.classLabel}</b>
              <span>
                {[data.term.name, data.term.academicYear].filter(Boolean).join(" · ")}
                {first ? ` · ${fmtDate(first)}${last && last !== first ? ` to ${fmtDate(last)}` : ""}` : ""}
              </span>
            </div>
            <div className="ds2-list">
              {b.papers.map((p, i) => {
                const d = p.examDate ? new Date(`${p.examDate}T00:00:00Z`) : null;
                return (
                  <div className="ds2-row" key={p.subject + i}>
                    <div className="ds2-date">
                      {d ? (
                        <>
                          <b>{d.getUTCDate()}</b>
                          <span>{d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</span>
                        </>
                      ) : (
                        <span>Date to be announced</span>
                      )}
                    </div>
                    <div className="ds2-day">{p.day || "—"}</div>
                    <div className="ds2-subject">
                      <b>{p.subject}</b>
                      {p.code ? <small>{p.code}</small> : null}
                    </div>
                    <div className="ds2-time">
                      {p.startTime ? `${fmtTime(p.startTime)} – ${fmtTime(p.endTime)}` : "—"}
                      {p.room ? <small>Room {p.room}</small> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="ds2-notes">
              <b>Instructions</b>
              <ul>
                <li>Reach the examination hall 15 minutes before the paper starts.</li>
                <li>Bring the roll number slip, school card and your own stationery to every paper.</li>
                <li>Mobile phones, smart watches and notes are not allowed in the hall.</li>
                <li>A student absent from a paper is marked absent for that subject.</li>
              </ul>
            </div>
            <div className="signs">
              <span>Controller of Exams</span>
              <span>Principal</span>
            </div>
          </section>
        );
      })}
    </PrintShell>
  );
}

type Component = { key: string; label: string; maxMarks: number };

type ResultData = {
  school: SchoolHeader;
  term: { name: string; academicYear: string; type: string };
  showGpa: boolean;
  batches: {
    classId: string;
    classLabel: string;
    /** The class's campus letterhead. */
    head?: SchoolHeader;
    subjects: { _id: string; name: string; code: string; totalMarks: number; passingMarks: number; components: Component[] }[];
    stats: { students: number; complete: number; passed: number; failed: number; average: number; highest: number };
    cards: {
      student: { _id: string; name: string; fatherName: string; admissionNo: string; rollNo: string; photoUrl?: string | null; dateOfBirth?: string };
      subjects: {
        subjectId: string;
        name: string;
        credits: number;
        totalMarks: number;
        passingMarks: number;
        components: (Component & { obtained: number | null })[];
        obtained: number;
        percent: number;
        grade: string;
        gpa: number;
        status: "pass" | "fail" | "absent" | "pending";
      }[];
      totalMarks: number;
      obtained: number;
      percent: number;
      grade: string;
      gpa: number;
      result: string;
      remarks: string;
      position: number;
    }[];
  }[];
};

function resultsUrl(termId: string, classIds: string) {
  return termId && classIds ? `/api/exams/center/results?termId=${termId}&classIds=${classIds}` : null;
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Passport-size photo box; initials when the student has no photo yet. */
function StudentPhoto({ url, name, small }: { url?: string | null; name: string; small?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className={`stu-photo${small ? " small" : ""}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} />
      ) : (
        <span>{initials || "?"}</span>
      )}
    </div>
  );
}

const STATUS_LABEL = { pass: "Pass", fail: "Fail", absent: "Absent", pending: "Pending" } as const;

export function ResultCardsPrint({ termId, classIds, studentId, src }: { termId: string; classIds: string; studentId?: string; src?: string }) {
  const url = resultsUrl(termId, classIds);
  const { data: all, error } = usePrintData<ResultData>(src || (url && studentId ? `${url}&student=${studentId}` : url));
  // One student's card when opened from their profile.
  const data = all && studentId
    ? { ...all, batches: all.batches.map((b) => ({ ...b, cards: b.cards.filter((c) => c.student._id === studentId) })) }
    : all;
  const count = data?.batches.reduce((s, b) => s + b.cards.length, 0) || 0;
  return (
    <PrintShell title="Result Cards" info={data ? `${count} cards` : undefined} error={error} loading={!data} closable={!src}>
      {data?.batches.map((b) => {
        // Union of component labels across papers, so every row lines up under the same columns.
        const columns: Component[] = [];
        for (const s of b.subjects) for (const c of s.components) if (!columns.some((x) => x.key === c.key)) columns.push(c);
        const split = !(columns.length === 1 && ["total", "written"].includes(columns[0].key));
        return (
          <Fragment key={b.classId}>
            {b.cards.map((card) => (
              <section key={card.student._id} className="doc-page result-card-doc rc2">
                <SchoolHead school={b.head || data.school} title="RESULT CARD" sub={`${data.term.name} · ${data.term.academicYear}`} />
                <div className="rc2-band">
                  <b>Progress Report</b>
                  <span>{[data.term.name, data.term.type, data.term.academicYear].filter(Boolean).join(" · ")}</span>
                </div>

                <div className="rc2-profile">
                  <StudentPhoto url={card.student.photoUrl} name={card.student.name} />
                  <div className="rc2-who">
                    <h2>{card.student.name}</h2>
                    <dl>
                      <div><dt>Father / Guardian</dt><dd>{card.student.fatherName || "—"}</dd></div>
                      <div><dt>Class</dt><dd>{b.classLabel}</dd></div>
                      <div><dt>Roll No.</dt><dd>{card.student.rollNo || "—"}</dd></div>
                      <div><dt>Admission No.</dt><dd>{card.student.admissionNo}</dd></div>
                      <div><dt>Session</dt><dd>{data.term.academicYear || "—"}</dd></div>
                      <div><dt>Date of Birth</dt><dd>{card.student.dateOfBirth ? fmtDate(card.student.dateOfBirth) : "—"}</dd></div>
                    </dl>
                  </div>
                  <div className={`rc2-badge ${card.result === "PASS" ? "pass" : card.result === "FAIL" ? "fail" : ""}`}>
                    <span>Result</span>
                    <b>{card.result}</b>
                    {card.position ? <small>{ordinal(card.position)} of {b.stats.complete}</small> : null}
                  </div>
                </div>

                <table className="rc2-table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      {split ? columns.map((c) => <th key={c.key} className="num">{c.label}</th>) : null}
                      <th className="num">Max</th>
                      <th className="num">Obtained</th>
                      <th className="rc2-bar-h">Score</th>
                      <th className="num">Grade</th>
                      {data.showGpa ? <th className="num">Cr.</th> : null}
                      {data.showGpa ? <th className="num">GP</th> : null}
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.subjects.map((s) => (
                      <tr key={s.subjectId} className={s.status === "fail" || s.status === "absent" ? "rc-fail" : ""}>
                        <td><b>{s.name}</b></td>
                        {split
                          ? columns.map((c) => {
                              const part = s.components.find((x) => x.key === c.key);
                              return (
                                <td key={c.key} className="num">
                                  {part ? `${part.obtained ?? "—"}/${part.maxMarks}` : "—"}
                                </td>
                              );
                            })
                          : null}
                        <td className="num">{s.totalMarks}</td>
                        <td className="num"><b>{s.status === "absent" ? "ABS" : s.status === "pending" ? "—" : s.obtained}</b></td>
                        <td className="rc2-bar">
                          {s.status === "pending" ? "—" : (
                            <>
                              <i style={{ width: `${Math.max(0, Math.min(100, s.percent))}%` }} />
                              <span>{s.percent}%</span>
                            </>
                          )}
                        </td>
                        <td className="num"><b>{s.status === "pending" ? "—" : s.grade}</b></td>
                        {data.showGpa ? <td className="num">{s.credits}</td> : null}
                        {data.showGpa ? <td className="num">{s.gpa.toFixed(1)}</td> : null}
                        <td><span className={`rc2-st ${s.status}`}>{STATUS_LABEL[s.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><b>Grand Total</b></td>
                      {split ? columns.map((c) => <td key={c.key} />) : null}
                      <td className="num"><b>{card.totalMarks}</b></td>
                      <td className="num"><b>{card.obtained}</b></td>
                      <td className="rc2-bar"><i style={{ width: `${Math.max(0, Math.min(100, card.percent))}%` }} /><span>{card.percent}%</span></td>
                      <td className="num"><b>{card.grade}</b></td>
                      {data.showGpa ? <td /> : null}
                      {data.showGpa ? <td className="num"><b>{card.gpa.toFixed(2)}</b></td> : null}
                      <td />
                    </tr>
                  </tfoot>
                </table>

                <div className="rc2-tiles">
                  <div><span>Marks</span><b>{card.obtained} / {card.totalMarks}</b></div>
                  <div><span>Percentage</span><b>{card.percent}%</b></div>
                  <div><span>Grade</span><b>{card.grade}</b></div>
                  {data.showGpa ? <div><span>GPA</span><b>{card.gpa.toFixed(2)}</b></div> : null}
                  <div><span>Position</span><b>{card.position ? `${ordinal(card.position)} / ${b.stats.complete}` : "—"}</b></div>
                  <div><span>Class average</span><b>{b.stats.average}%</b></div>
                  <div><span>Highest in class</span><b>{b.stats.highest}%</b></div>
                </div>

                <div className="rc2-remarks">
                  <b>Teacher&apos;s remarks</b>
                  <p>{card.remarks}</p>
                </div>
                <div className="rc-scale">Grading: A+ 80%+ · A 70–79 · B 60–69 · C 50–59 · D 40–49 · F below 40</div>
                <div className="signs">
                  <span>Class Teacher</span>
                  <span>Principal</span>
                  <span>Parent / Guardian</span>
                </div>
              </section>
            ))}
          </Fragment>
        );
      })}
    </PrintShell>
  );
}

export function ResultSheetPrint({ termId, classIds }: { termId: string; classIds: string }) {
  const { data, error } = usePrintData<ResultData>(resultsUrl(termId, classIds));
  return (
    <PrintShell title="Class Result Sheet" info={data ? `${data.batches.length} class(es)` : undefined} error={error} loading={!data} landscape>
      {data?.batches.map((b) => (
        <section key={b.classId} className="doc-page">
          <SchoolHead school={b.head || data.school} title="RESULT SHEET" sub={`${data.term.name} · ${data.term.academicYear} · ${b.classLabel}`} />
          <table className="doc-table rs-table">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Student</th>
                {b.subjects.map((s) => (
                  <th key={s._id} className="num" title={s.name}>
                    {s.code || s.name}
                    <small>/{s.totalMarks}</small>
                  </th>
                ))}
                <th className="num">Total</th>
                <th className="num">%</th>
                <th className="num">Grade</th>
                <th className="num">Pos.</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {b.cards.map((c) => (
                <tr key={c.student._id}>
                  <td>{c.student.rollNo}</td>
                  <td>{c.student.name}</td>
                  {c.subjects.map((s) => (
                    <td key={s.subjectId} className={`num${s.status === "fail" || s.status === "absent" ? " rs-fail" : ""}`}>
                      {s.status === "absent" ? "A" : s.status === "pending" ? "—" : s.obtained}
                    </td>
                  ))}
                  <td className="num"><b>{c.obtained}</b>/{c.totalMarks}</td>
                  <td className="num">{c.percent}</td>
                  <td className="num">{c.grade}</td>
                  <td className="num">{c.position || "—"}</td>
                  <td>{c.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rc-summary" style={{ marginTop: 12 }}>
            <div><span>Students</span><b>{b.stats.students}</b></div>
            <div><span>Passed</span><b>{b.stats.passed}</b></div>
            <div><span>Failed</span><b>{b.stats.failed}</b></div>
            <div><span>Pass %</span><b>{b.stats.complete ? Math.round((b.stats.passed / b.stats.complete) * 100) : 0}%</b></div>
            <div><span>Average</span><b>{b.stats.average}%</b></div>
          </div>
          <div className="signs">
            <span>Class Teacher</span>
            <span>Controller of Exams</span>
            <span>Principal</span>
          </div>
        </section>
      ))}
    </PrintShell>
  );
}
