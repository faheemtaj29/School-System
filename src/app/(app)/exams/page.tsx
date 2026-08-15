"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, NameCell, Panel } from "@/components/ui";
import { ExamForm } from "@/components/forms/SchoolForms";
import {
  ClassItem,
  ExamItem,
  StudentItem,
  SubjectItem,
  TeacherItem,
  dayMonth,
  fullName,
  labelOfClass,
  prettyDate,
} from "@/lib/types";

function gradeTone(percent: number) {
  if (percent >= 80) return "present";
  if (percent >= 50) return "leave";
  return "absent";
}

export default function ExamsPage() {
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExamItem | null>(null);
  const [selectedId, setSelectedId] = useState("");

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

  async function remove(id: string) {
    if (!confirm("Delete this exam?")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  const selected = useMemo(
    () => exams.find((e) => e._id === selectedId) ?? exams[0] ?? null,
    [exams, selectedId]
  );

  return (
    <>
      <Hero
        title="Exams & Results"
        subtitle={`${exams.length} exams · Session ${new Date().getFullYear()}`}
        actionLabel="Schedule Exam"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      {!exams.length ? (
        <EmptyState message="No exams yet. Schedule your first exam and enter results." />
      ) : (
        <>
          <div className="grid-2">
            <div>
              <Panel title="Exam Schedule" meta={`${exams.length} TOTAL`}>
                {exams.map((exam) => {
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
              <Panel title="Exam Summary">
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

          <Panel
            title={selected ? `Result Sheet — ${selected.title}` : "Result Sheet"}
            meta={selected ? labelOfClass(selected.classId as never).toUpperCase() : undefined}
          >
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
                  {(selected?.results ?? []).map((r, i) => {
                    const student =
                      typeof r.studentId === "object"
                        ? (r.studentId as StudentItem)
                        : students.find((s) => s._id === r.studentId);
                    const pct = selected?.maxMarks
                      ? Math.round((r.marks / selected.maxMarks) * 100)
                      : 0;
                    return (
                      <tr key={`${selected?._id}-${i}`}>
                        <td>
                          <NameCell
                            name={student ? fullName(student) : "Unknown"}
                            sub={student?.admissionNo}
                          />
                        </td>
                        <td className="num">
                          {r.marks} / {selected?.maxMarks}
                        </td>
                        <td className="num">{pct}%</td>
                        <td className="right">
                          <span className={`badge ${gradeTone(pct)}`}>{r.grade || "—"}</span>
                        </td>
                        <td>{r.remarks || "—"}</td>
                      </tr>
                    );
                  })}
                  {!selected?.results?.length ? (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--text-dim)", padding: "22px 0" }}>
                        No results entered for this exam yet — edit the exam to add marks.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

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
