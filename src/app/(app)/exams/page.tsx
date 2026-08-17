"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmptyState, Field, Hero, NameCell, Panel, inputClass } from "@/components/ui";
import { ExamForm } from "@/components/forms/SchoolForms";
import {
  ClassItem,
  ExamItem,
  StudentItem,
  SubjectItem,
  TeacherItem,
  dayMonth,
  fullName,
  idOf,
  labelOfClass,
  prettyDate,
} from "@/lib/types";

function gradeTone(percent: number) {
  if (percent >= 80) return "present";
  if (percent >= 50) return "leave";
  return "absent";
}

function gradeForPercent(percent: number) {
  if (percent >= 80) return "A";
  if (percent >= 70) return "B";
  if (percent >= 60) return "C";
  if (percent >= 50) return "D";
  if (percent >= 40) return "E";
  return "F";
}

const MARKS_ACTIONS: Record<string, { action: string; label: string }> = {
  draft: { action: "submit", label: "Submit marks" },
  submitted: { action: "verify", label: "Verify marks" },
  verified: { action: "approve", label: "Approve results" },
  approved: { action: "lock", label: "Lock result" },
  locked: { action: "publish", label: "Publish result" },
};

function marksStatusLabel(status?: string) {
  return (status || "draft").replace(/^./, (letter) => letter.toUpperCase());
}

export default function ExamsPage() {
  const searchParams = useSearchParams();
  const requestedModule = searchParams.get("module") || "schedule";
  const [module, setModule] = useState(requestedModule);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExamItem | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [sheetClassId, setSheetClassId] = useState("");
  const [sheetTerm, setSheetTerm] = useState("");
  const [resultsClassId, setResultsClassId] = useState("");
  const [resultsStudentId, setResultsStudentId] = useState("");
  const [dispatchMsg, setDispatchMsg] = useState("");
  const [view, setView] = useState<"exams" | "results">("exams");
  const [resultRows, setResultRows] = useState<
    { studentId: string; student?: StudentItem; marks: number; remarks: string }[]
  >([]);

  const load = useCallback(async () => {
    const [e, c, s, t, st] = await Promise.all([
      fetch("/api/exams").then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
    ]);
    setExams(e.exams || []);
    setClasses(c.classes || []);
    setSubjects(s.subjects || []);
    setTeachers(t.teachers || []);
    setStudents(st.students || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setModule(requestedModule);
    if (requestedModule === "marks" || requestedModule === "workflow") setView("results");
    if (requestedModule === "schedule" || requestedModule === "datesheet") setView("exams");
  }, [requestedModule]);

  async function remove(id: string) {
    if (!confirm("Delete this exam?")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  const visibleExams = useMemo(
    () =>
      exams.filter((exam) =>
        (module === "marks" || module === "workflow") && resultsClassId
          ? idOf(exam.classId) === resultsClassId
          : true
      ),
    [exams, module, resultsClassId]
  );

  const selected = useMemo(
    () => visibleExams.find((e) => e._id === selectedId) ?? visibleExams[0] ?? null,
    [visibleExams, selectedId]
  );

  useEffect(() => {
    if ((module === "marks" || module === "workflow") && resultsClassId) {
      const classExams = exams.filter((exam) => idOf(exam.classId) === resultsClassId);
      if (classExams.length && (!selectedId || !classExams.some((exam) => exam._id === selectedId))) {
        setSelectedId(classExams[0]._id);
      }
      if (!classExams.length) {
        setSelectedId("");
      }
    }
  }, [module, resultsClassId, exams, selectedId]);

  const resultStudents = useMemo(
    () => students.filter((student) => !resultsClassId || idOf(student.classId) === resultsClassId),
    [students, resultsClassId]
  );

  useEffect(() => {
    const activeClassId = resultsClassId || (selected ? idOf(selected.classId) : "");
    if (!activeClassId) {
      setResultRows([]);
      return;
    }

    const classStudents = students.filter((s) => idOf(s.classId) === activeClassId);
    const map = new Map((selected?.results ?? []).map((result) => [String(idOf(result.studentId)), result]));
    setResultRows(
      classStudents.filter((student) => !resultsStudentId || student._id === resultsStudentId).map((student) => {
        const match = map.get(student._id);
        const marks = Number(match?.marks ?? 0);
        return {
          studentId: student._id,
          student,
          marks,
          remarks: match?.remarks ?? "",
        };
      })
    );
  }, [selected, resultsClassId, resultsStudentId, students]);

  async function saveSelectedResults() {
    if (!selected) {
      alert("Create or select an exam for this class before saving marks.");
      return;
    }

    const payload = {
      title: selected.title,
      examType: selected.examType,
      classId: idOf(selected.classId),
      subjectId: idOf(selected.subjectId),
      teacherId: idOf(selected.teacherId as never),
      date: selected.date,
      maxMarks: Number(selected.maxMarks),
      results: resultRows.map((row) => {
        const percent = selected.maxMarks ? Math.round((Number(row.marks || 0) / selected.maxMarks) * 100) : 0;
        return {
          studentId: row.studentId,
          marks: Number(row.marks || 0),
          grade: gradeForPercent(percent),
          remarks: row.remarks || "",
        };
      }),
    };

    const res = await fetch(`/api/exams/${selected._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      alert("Failed to save result sheet.");
      return;
    }

    await load();
  }

  async function advanceMarks(action: string) {
    if (!selected) return;
    const note = action === "unlock" ? prompt("Reason for unlocking these marks:") || "" : "";
    if (action === "unlock" && !note) return;
    const res = await fetch(`/api/exams/${selected._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "workflow", action, note }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not advance marks workflow.");
      return;
    }
    await load();
  }

  const dateSheetExams = useMemo(
    () =>
      exams
        .filter((exam) => (sheetClassId ? idOf(exam.classId) === sheetClassId : true))
        .filter((exam) =>
          sheetTerm ? exam.examType.toLowerCase() === sheetTerm.toLowerCase() : true
        )
        .sort((a, b) => +new Date(a.date) - +new Date(b.date)),
    [exams, sheetClassId, sheetTerm]
  );

  const dateSheetText = useMemo(() => {
    if (!dateSheetExams.length) return "No exams in selected date sheet filter.";
    const headClass = sheetClassId
      ? labelOfClass(classes.find((c) => c._id === sheetClassId) as never)
      : "All Classes";
    const headTerm = sheetTerm || "All Terms";
    const lines = dateSheetExams.map((exam) => {
      const subject = typeof exam.subjectId === "object" ? exam.subjectId.name : exam.subjectId;
      return `${prettyDate(exam.date)} | ${labelOfClass(exam.classId as never)} | ${subject} | ${exam.examType} | ${exam.maxMarks} marks`;
    });
    return [`Date Sheet`, `Class: ${headClass}`, `Term: ${headTerm}`, "", ...lines].join("\n");
  }, [dateSheetExams, sheetClassId, sheetTerm, classes]);

  const selectedClassStudents = useMemo(
    () => students.filter((s) => (sheetClassId ? idOf(s.classId) === sheetClassId : true)),
    [students, sheetClassId]
  );

  function normalizePhone(value: string) {
    return value.replace(/[^\d+]/g, "").replace(/^00/, "+");
  }

  function dispatchDateSheetOneGo() {
    setDispatchMsg("");
    if (!sheetClassId) {
      setDispatchMsg("Select a class first for class-wise dispatch.");
      return;
    }
    if (!dateSheetExams.length) {
      setDispatchMsg("No date sheet rows for this class/term.");
      return;
    }

    const emails = Array.from(
      new Set(
        selectedClassStudents
          .flatMap((s) => [s.email, s.parentEmail])
          .filter((x): x is string => Boolean(x && x.trim()))
      )
    );

    const phones = Array.from(
      new Set(
        selectedClassStudents
          .flatMap((s) => [s.parentPhone, s.phone])
          .filter((x): x is string => Boolean(x && x.trim()))
          .map((x) => normalizePhone(x))
      )
    );

    const classLabel = labelOfClass(classes.find((c) => c._id === sheetClassId) as never);
    const subject = `Date Sheet - ${classLabel} - ${sheetTerm || "All Terms"}`;
    const body = `${dateSheetText}\n\nClass Students: ${selectedClassStudents.length}\nEmails: ${emails.length}\nPhones: ${phones.length}`;

    navigator.clipboard
      ?.writeText(`${body}\n\nPhone List:\n${phones.join(", ")}`)
      .catch(() => undefined);

    // 1) PDF: opens print dialog so admin can Save as PDF.
    window.print();

    // 2) Email: opens draft with all recipients in BCC.
    window.open(
      `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      "_blank"
    );

    // 3) WhatsApp: open share composer with datesheet text.
    // Contact list is copied to clipboard for quick broadcast list pasting.
    window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, "_blank");
    setDispatchMsg(
      `Dispatch started: ${emails.length} emails, ${phones.length} WhatsApp contacts. Date sheet text copied to clipboard.`
    );
  }

  return (
    <>
      <Hero
        title={module === "datesheet" ? "Date Sheet" : module === "marks" ? "Marks Entry" : module === "workflow" ? "Result Workflow" : "Exam Schedule"}
        subtitle={module === "datesheet" ? "Class-wise dates, subjects and dispatch" : module === "marks" ? "Teacher marks register by student and subject" : module === "workflow" ? "Verify, approve, lock and publish results" : `${exams.length} exams · Session ${new Date().getFullYear()}`}
        actionLabel={module === "schedule" ? "Schedule Exam" : undefined}
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      {module === "marks" || module === "workflow" ? (
        <Panel title="Results Filter" meta="CLASS-WISE">
          <div className="form-grid">
                <Field label="Class">
              <select
                className={inputClass}
                value={resultsClassId}
                onChange={(e) => {
                  setResultsClassId(e.target.value);
                  setSelectedId("");
                    setResultsStudentId("");
                }}
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} - {c.section}
                  </option>
                ))}
              </select>
            </Field>
                <Field label="Student">
                  <select
                    className={inputClass}
                    value={resultsStudentId}
                    onChange={(e) => setResultsStudentId(e.target.value)}
                    disabled={!resultsClassId}
                  >
                    <option value="">Select student</option>
                    {resultStudents.map((student) => (
                      <option key={student._id} value={student._id}>
                        {student.admissionNo} — {fullName(student)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Subject / Exam">
                  <select
                    className={inputClass}
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={!resultsClassId || !resultsStudentId}
                  >
                    <option value="">Select scheduled subject</option>
                    {exams
                      .filter((exam) => !resultsClassId || idOf(exam.classId) === resultsClassId)
                      .map((exam) => (
                        <option key={exam._id} value={exam._id}>
                          {typeof exam.subjectId === "object" ? exam.subjectId.name : exam.subjectId} · {exam.examType} · {prettyDate(exam.date)}
                        </option>
                      ))}
                  </select>
                </Field>
          </div>
              {module === "marks" && !resultsStudentId ? (
                <div className="alert" style={{ marginTop: 12 }}>
                  Select a class first, then a student. Scheduled subjects/exams will load for the selected class.
                </div>
              ) : null}
        </Panel>
      ) : null}

      {module === "datesheet" ? (
      <Panel title="Date Sheet Builder" meta="CLASS-WISE · TERM-WISE">
        <div className="form-grid" style={{ marginBottom: 12 }}>
          <Field label="Class">
            <select
              className={inputClass}
              value={sheetClassId}
              onChange={(e) => setSheetClassId(e.target.value)}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} - {c.section}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Term / Type">
            <input
              className={inputClass}
              value={sheetTerm}
              onChange={(e) => setSheetTerm(e.target.value)}
              placeholder="e.g. midterm, final, term-1"
            />
          </Field>
        </div>
        <div className="form-actions" style={{ marginTop: 0 }}>
          <button type="button" className="btn-dark" onClick={dispatchDateSheetOneGo}>
            + One Go Dispatch (PDF + Email + WhatsApp)
          </button>
        </div>
        {dispatchMsg ? <div className="alert">{dispatchMsg}</div> : null}
        <div className="table-scroll" style={{ marginTop: 10 }}>
          <table className="reg">
            <thead>
              <tr>
                <th>Date</th>
                <th>Class</th>
                <th>Subject</th>
                <th>Term</th>
                <th className="right">Marks</th>
              </tr>
            </thead>
            <tbody>
              {dateSheetExams.map((exam) => (
                <tr key={`sheet-${exam._id}`}>
                  <td>{prettyDate(exam.date)}</td>
                  <td>{labelOfClass(exam.classId as never)}</td>
                  <td>{typeof exam.subjectId === "object" ? exam.subjectId.name : exam.subjectId}</td>
                  <td>{exam.examType}</td>
                  <td className="num">{exam.maxMarks}</td>
                </tr>
              ))}
              {!dateSheetExams.length ? (
                <tr>
                  <td colSpan={5} style={{ color: "var(--text-dim)" }}>
                    No exams for selected class/term.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      ) : null}

      {module !== "datesheet" ? (!exams.length ? (
        <EmptyState message="No exams yet. Schedule your first exam and enter results." />
      ) : (
        <>
          <div className="grid-2">
            <div>
              <Panel title="Exam Schedule" meta={`${visibleExams.length} TOTAL`}>
                {visibleExams.map((exam) => {
                  const d = dayMonth(exam.date);
                  const upcoming = new Date(exam.date) >= new Date();
                  return (
                    <div
                      className="exam-card"
                      key={exam._id}
                      onClick={() => setSelectedId(exam._id)}
                      style={{
                        cursor: "pointer",
                        borderColor:
                          selected?._id === exam._id ? "var(--jade)" : "var(--line)",
                      }}
                    >
                      <div className="exam-date">
                        <b>{d.day}</b>
                        <span>{d.month}</span>
                      </div>
                      <div className="exam-info">
                        <div className="et">{exam.title}</div>
                        <div className="es">
                          {labelOfClass(exam.classId as never)} ·{" "}
                          {typeof exam.subjectId === "object"
                            ? exam.subjectId.name
                            : exam.subjectId}{" "}
                          · {exam.maxMarks} marks
                        </div>
                      </div>
                      <span className={`badge ${upcoming ? "leave" : "present"}`}>
                        {upcoming ? "upcoming" : exam.examType}
                      </span>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setEditing(exam);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            remove(exam._id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Panel>
            </div>

            <div>
              <Panel title={module === "marks" || module === "workflow" ? "Result Summary" : "Exam Summary"}>
                {selected ? (
                  <>
                    <div className="fee-row">
                      <span>Exam</span>
                      <span style={{ fontWeight: 600 }}>{selected.title}</span>
                    </div>
                    <div className="fee-row">
                      <span>Class</span>
                      <span>{labelOfClass(selected.classId as never)}</span>
                    </div>
                    <div className="fee-row">
                      <span>Subject</span>
                      <span>
                        {typeof selected.subjectId === "object"
                          ? selected.subjectId.name
                          : selected.subjectId}
                      </span>
                    </div>
                    <div className="fee-row">
                      <span>Date</span>
                      <span className="mono">{prettyDate(selected.date)}</span>
                    </div>
                    <div className="fee-row">
                      <span>Results entered</span>
                      <span className="mono">{selected.results?.length ?? 0}</span>
                    </div>
                    <div className="fee-row">
                      <span>Marks workflow</span>
                      <span className={`badge ${selected.marksStatus === "published" ? "present" : "leave"}`}>
                        {marksStatusLabel(selected.marksStatus)}
                      </span>
                    </div>
                    <div className="fee-row total">
                      <span>TOTAL MARKS</span>
                      <span>{selected.maxMarks}</span>
                    </div>
                  </>
                ) : (
                  <EmptyState message="Select an exam to view details." />
                )}
              </Panel>
            </div>
          </div>

          {module === "marks" || module === "workflow" ? (
            <Panel
              title={selected ? `Result Sheet — ${selected.title}` : "Result Sheet"}
              meta={selected ? labelOfClass(selected.classId as never).toUpperCase() : undefined}
            >
              <div className="form-actions" style={{ margin: "0 0 12px" }}>
                {module === "marks" ? (
                  <button
                    type="button"
                    className="btn-dark"
                    onClick={saveSelectedResults}
                    disabled={!resultsStudentId || selected?.marksStatus === "locked" || selected?.marksStatus === "published"}
                  >
                    Save Result Sheet
                  </button>
                ) : null}
                {selected && MARKS_ACTIONS[selected.marksStatus || "draft"] ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => advanceMarks(MARKS_ACTIONS[selected.marksStatus || "draft"].action)}
                    disabled={!selected.results?.length}
                  >
                    {MARKS_ACTIONS[selected.marksStatus || "draft"].label}
                  </button>
                ) : null}
                {selected && ["locked", "published"].includes(selected.marksStatus || "") ? (
                  <button type="button" className="btn-ghost" onClick={() => advanceMarks("unlock")}>
                    Unlock with reason
                  </button>
                ) : null}
              </div>
              {selected ? (
                <div className="alert" style={{ marginBottom: 12 }}>
                  Workflow: Draft → Submitted → Verified → Approved → Locked → Published. Official result cards are generated only after publication.
                </div>
              ) : null}
              {selected ? (
                <div className="fee-row" style={{ marginBottom: 12 }}>
                  <span>Class students</span>
                  <span className="mono">{resultRows.length}</span>
                </div>
              ) : null}
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th className="right">Marks</th>
                      <th className="right">Percentage</th>
                      <th className="right">Grade</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.map((row) => {
                      const student = row.student ?? students.find((s) => s._id === row.studentId);
                      const pct = selected?.maxMarks
                        ? Math.round((Number(row.marks || 0) / selected.maxMarks) * 100)
                        : 0;
                      const grade = gradeForPercent(pct);

                      return (
                        <tr key={`${selected?._id}-${row.studentId}`}>
                          <td>
                            <NameCell
                              name={student ? fullName(student) : "Unknown"}
                              sub={student?.admissionNo}
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              min={0}
                              max={selected?.maxMarks ?? 100}
                              className={inputClass}
                              value={row.marks}
                              disabled={module === "workflow" || selected?.marksStatus === "locked" || selected?.marksStatus === "published"}
                              onChange={(e) =>
                                setResultRows((prev) =>
                                  prev.map((item) =>
                                    item.studentId === row.studentId
                                      ? { ...item, marks: Number(e.target.value) || 0 }
                                      : item
                                  )
                                )
                              }
                              style={{ width: 92 }}
                            />
                            / {selected?.maxMarks}
                          </td>
                          <td className="num">{pct}%</td>
                          <td className="right">
                            <span className={`badge ${gradeTone(pct)}`}>{grade}</span>
                          </td>
                          <td>
                            <input
                              className={inputClass}
                              value={row.remarks}
                              disabled={module === "workflow" || selected?.marksStatus === "locked" || selected?.marksStatus === "published"}
                              onChange={(e) =>
                                setResultRows((prev) =>
                                  prev.map((item) =>
                                    item.studentId === row.studentId
                                      ? { ...item, remarks: e.target.value }
                                      : item
                                  )
                                )
                              }
                              placeholder="Remark"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    {!resultRows.length ? (
                      <tr>
                        <td colSpan={5} style={{ color: "var(--text-dim)", padding: "22px 0" }}>
                          No students found for this class yet. Add students to the class first.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {selected && resultRows.length ? (
                <div className="fee-row total" style={{ marginTop: 12 }}>
                  <span>Class total marks</span>
                  <span>
                    {resultRows.reduce((sum, row) => sum + Number(row.marks || 0), 0)} / {resultRows.length * (selected.maxMarks || 0)}
                  </span>
                </div>
              ) : null}
            </Panel>
          ) : null}
        </>
      )) : null}

      <ExamForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        classes={classes}
        subjects={subjects}
        teachers={teachers}
        students={students}
      />
    </>
  );
}
