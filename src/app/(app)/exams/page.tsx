"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, NameCell, Panel, StatusBadge, inputClass } from "@/components/ui";
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

type WorkflowTab = "results" | "types" | "terms" | "schedules";

type ExamTypeItem = {
  _id: string;
  key: string;
  name: string;
  category: "school" | "college" | "university" | "custom";
  isActive: boolean;
  defaultMaxMarks: number;
  defaultPassingMarks: number;
};

type ExamTermItem = {
  _id: string;
  name: string;
  academicYear: string;
  examTypeId?: ExamTypeItem | string | null;
  weightPercent: number;
  status: "draft" | "active" | "closed";
  startDate: string;
  endDate: string;
  remarks?: string;
};

type RefSubject = { _id: string; name: string; code?: string };

type ExamScheduleRowItem = {
  subjectId: RefSubject | string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  totalMarks: number;
  passingMarks: number;
  room?: string;
  invigilatorId?: TeacherItem | string;
  instructions?: string;
  status: "draft" | "published";
};

type ExamScheduleItem = {
  _id: string;
  academicYear: string;
  termId: ExamTermItem | string;
  examTypeId?: ExamTypeItem | string | null;
  classId: ClassItem | string;
  status: "draft" | "published";
  rows: ExamScheduleRowItem[];
};

const emptyTypeForm = {
  key: "",
  name: "",
  category: "school" as const,
  isActive: true,
  defaultMaxMarks: 100,
  defaultPassingMarks: 40,
};

const emptyTermForm = {
  name: "",
  academicYear: "",
  examTypeId: "",
  weightPercent: 100,
  status: "draft" as const,
  startDate: "",
  endDate: "",
  remarks: "",
};

export default function ExamsPage() {
  const [tab, setTab] = useState<WorkflowTab>("results");
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExamItem | null>(null);
  const [selectedId, setSelectedId] = useState("");

  const [types, setTypes] = useState<ExamTypeItem[]>([]);
  const [terms, setTerms] = useState<ExamTermItem[]>([]);
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>([]);
  const [typeForm, setTypeForm] = useState({ ...emptyTypeForm });
  const [termForm, setTermForm] = useState({ ...emptyTermForm });
  const [editingTypeId, setEditingTypeId] = useState("");
  const [editingTermId, setEditingTermId] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [workflowMsg, setWorkflowMsg] = useState("");
  const [workflowErr, setWorkflowErr] = useState("");

  const currentAcademicYear = useMemo(() => {
    const now = new Date().getFullYear();
    return `${now}-${String(now + 1).slice(-2)}`;
  }, []);

  const [scheduleForm, setScheduleForm] = useState<{
    academicYear: string;
    termId: string;
    examTypeId: string;
    classId: string;
    status: "draft" | "published";
    rows: {
      subjectId: string;
      examDate: string;
      startTime: string;
      endTime: string;
      totalMarks: number;
      passingMarks: number;
      room: string;
      invigilatorId: string;
      instructions: string;
      status: "draft" | "published";
    }[];
  }>({
    academicYear: currentAcademicYear,
    termId: "",
    examTypeId: "",
    classId: "",
    status: "draft",
    rows: [],
  });

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

  const loadWorkflow = useCallback(async () => {
    const [ty, tm, sc] = await Promise.all([
      fetch("/api/exams/types").then((r) => r.json()),
      fetch("/api/exams/terms").then((r) => r.json()),
      fetch("/api/exams/schedules").then((r) => r.json()),
    ]);
    setTypes(ty.types || []);
    setTerms(tm.terms || []);
    setSchedules(sc.schedules || []);
  }, []);

  useEffect(() => {
    // Initial page bootstrap intentionally hydrates local state from APIs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadWorkflow();
  }, [load, loadWorkflow]);

  async function remove(id: string) {
    if (!confirm("Delete this exam?")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  const selected = useMemo(
    () => exams.find((e) => e._id === selectedId) ?? exams[0] ?? null,
    [exams, selectedId]
  );

  function clearWorkflowAlerts() {
    setWorkflowErr("");
    setWorkflowMsg("");
  }

  async function saveType() {
    clearWorkflowAlerts();
    const method = editingTypeId ? "PUT" : "POST";
    const url = editingTypeId ? `/api/exams/types/${editingTypeId}` : "/api/exams/types";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(typeForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setWorkflowErr(data.error || "Failed to save exam type");
      return;
    }
    setTypeForm({ ...emptyTypeForm });
    setEditingTypeId("");
    setWorkflowMsg(editingTypeId ? "Exam type updated." : "Exam type created.");
    await loadWorkflow();
  }

  function editType(item: ExamTypeItem) {
    clearWorkflowAlerts();
    setEditingTypeId(item._id);
    setTypeForm({
      key: item.key,
      name: item.name,
      category: item.category,
      isActive: item.isActive,
      defaultMaxMarks: item.defaultMaxMarks,
      defaultPassingMarks: item.defaultPassingMarks,
    });
  }

  async function removeType(id: string) {
    if (!confirm("Delete this exam type?")) return;
    clearWorkflowAlerts();
    const res = await fetch(`/api/exams/types/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setWorkflowErr(data.error || "Failed to delete exam type");
      return;
    }
    setWorkflowMsg("Exam type deleted.");
    await loadWorkflow();
  }

  async function saveTerm() {
    clearWorkflowAlerts();
    const method = editingTermId ? "PUT" : "POST";
    const url = editingTermId ? `/api/exams/terms/${editingTermId}` : "/api/exams/terms";
    const payload = {
      ...termForm,
      examTypeId: termForm.examTypeId || null,
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setWorkflowErr(data.error || "Failed to save term");
      return;
    }
    setTermForm({ ...emptyTermForm, academicYear: currentAcademicYear });
    setEditingTermId("");
    setWorkflowMsg(editingTermId ? "Term updated." : "Term created.");
    await loadWorkflow();
  }

  function editTerm(item: ExamTermItem) {
    clearWorkflowAlerts();
    setEditingTermId(item._id);
    setTermForm({
      name: item.name,
      academicYear: item.academicYear,
      examTypeId: idOf(item.examTypeId as never),
      weightPercent: item.weightPercent,
      status: item.status,
      startDate: (item.startDate || "").slice(0, 10),
      endDate: (item.endDate || "").slice(0, 10),
      remarks: item.remarks || "",
    });
  }

  async function removeTerm(id: string) {
    if (!confirm("Delete this term?")) return;
    clearWorkflowAlerts();
    const res = await fetch(`/api/exams/terms/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setWorkflowErr(data.error || "Failed to delete term");
      return;
    }
    setWorkflowMsg("Term deleted.");
    await loadWorkflow();
  }

  async function loadClassSubjects(classId: string, examTypeId: string) {
    clearWorkflowAlerts();
    if (!classId) return;
    const subRes = await fetch(`/api/exams/schedules?view=subjects&classId=${classId}`);
    const subData = await subRes.json();
    if (!subRes.ok) {
      setWorkflowErr(subData.error || "Could not load class subjects");
      return;
    }
    const selectedType = types.find((t) => t._id === examTypeId);
    const rows = (subData.subjects || []).map((s: SubjectItem) => ({
      subjectId: s._id,
      examDate: "",
      startTime: "",
      endTime: "",
      totalMarks: selectedType?.defaultMaxMarks || 100,
      passingMarks: selectedType?.defaultPassingMarks || 40,
      room: "",
      invigilatorId: "",
      instructions: "",
      status: "draft" as const,
    }));
    setScheduleForm((prev) => ({ ...prev, rows }));
    setWorkflowMsg(`Loaded ${rows.length} subjects from class mapping.`);
  }

  function resetScheduleForm() {
    setEditingScheduleId("");
    setScheduleForm({
      academicYear: currentAcademicYear,
      termId: "",
      examTypeId: "",
      classId: "",
      status: "draft",
      rows: [],
    });
  }

  function editSchedule(item: ExamScheduleItem) {
    clearWorkflowAlerts();
    setEditingScheduleId(item._id);
    setScheduleForm({
      academicYear: item.academicYear,
      termId: idOf(item.termId as never),
      examTypeId: idOf(item.examTypeId as never),
      classId: idOf(item.classId as never),
      status: item.status,
      rows: (item.rows || []).map((r) => ({
        subjectId: idOf(r.subjectId as never),
        examDate: (r.examDate || "").slice(0, 10),
        startTime: r.startTime || "",
        endTime: r.endTime || "",
        totalMarks: r.totalMarks,
        passingMarks: r.passingMarks,
        room: r.room || "",
        invigilatorId: idOf(r.invigilatorId as never),
        instructions: r.instructions || "",
        status: r.status,
      })),
    });
  }

  async function saveSchedule() {
    clearWorkflowAlerts();
    const method = editingScheduleId ? "PUT" : "POST";
    const url = editingScheduleId
      ? `/api/exams/schedules/${editingScheduleId}`
      : "/api/exams/schedules";
    const payload = {
      ...scheduleForm,
      examTypeId: scheduleForm.examTypeId || null,
      rows: scheduleForm.rows.map((r) => ({
        ...r,
        examDate: r.examDate || null,
        startTime: r.startTime || null,
        endTime: r.endTime || null,
        invigilatorId: r.invigilatorId || null,
      })),
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setWorkflowErr(data.error || "Failed to save schedule");
      return;
    }
    setWorkflowMsg(editingScheduleId ? "Schedule updated." : "Schedule created.");
    resetScheduleForm();
    await loadWorkflow();
  }

  async function removeSchedule(id: string) {
    if (!confirm("Delete this schedule?")) return;
    clearWorkflowAlerts();
    const res = await fetch(`/api/exams/schedules/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setWorkflowErr(data.error || "Failed to delete schedule");
      return;
    }
    setWorkflowMsg("Schedule deleted.");
    await loadWorkflow();
  }

  return (
    <>
      <Hero
        title="Exams & Results"
        subtitle="Legacy results + exam workflow in one module"
        actionLabel={tab === "results" ? "Schedule Exam" : undefined}
        onAction={
          tab === "results"
            ? () => {
                setEditing(null);
                setOpen(true);
              }
            : undefined
        }
      />

      <div className="tabs">
        <button
          type="button"
          className={`tab${tab === "results" ? " active" : ""}`}
          onClick={() => setTab("results")}
        >
          Results Register
        </button>
        <button
          type="button"
          className={`tab${tab === "types" ? " active" : ""}`}
          onClick={() => setTab("types")}
        >
          Exam Types
        </button>
        <button
          type="button"
          className={`tab${tab === "terms" ? " active" : ""}`}
          onClick={() => setTab("terms")}
        >
          Terms
        </button>
        <button
          type="button"
          className={`tab${tab === "schedules" ? " active" : ""}`}
          onClick={() => setTab("schedules")}
        >
          Schedules
        </button>
      </div>

      {workflowErr ? <div className="alert err">{workflowErr}</div> : null}
      {workflowMsg ? <div className="alert ok">{workflowMsg}</div> : null}

      {tab === "results" && !exams.length ? (
        <EmptyState message="No exams yet. Schedule your first exam and enter results." />
      ) : null}

      {tab === "results" ? (
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
      ) : null}

      {tab === "types" ? (
        <div className="grid-2">
          <Panel title={editingTypeId ? "Edit Exam Type" : "New Exam Type"}>
            <div className="form-grid">
              <div className="field">
                <label>Key</label>
                <input
                  className={inputClass}
                  value={typeForm.key}
                  onChange={(e) => setTypeForm({ ...typeForm, key: e.target.value })}
                  placeholder="MIDTERM"
                />
              </div>
              <div className="field">
                <label>Name</label>
                <input
                  className={inputClass}
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="Midterm"
                />
              </div>
              <div className="field">
                <label>Category</label>
                <select
                  className={inputClass}
                  value={typeForm.category}
                  onChange={(e) =>
                    setTypeForm({
                      ...typeForm,
                      category: e.target.value as ExamTypeItem["category"],
                    })
                  }
                >
                  <option value="school">School</option>
                  <option value="college">College</option>
                  <option value="university">University</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  className={inputClass}
                  value={typeForm.isActive ? "active" : "inactive"}
                  onChange={(e) =>
                    setTypeForm({ ...typeForm, isActive: e.target.value === "active" })
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="field">
                <label>Default Total Marks</label>
                <input
                  type="number"
                  className={inputClass}
                  value={typeForm.defaultMaxMarks}
                  onChange={(e) =>
                    setTypeForm({ ...typeForm, defaultMaxMarks: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label>Default Passing Marks</label>
                <input
                  type="number"
                  className={inputClass}
                  value={typeForm.defaultPassingMarks}
                  onChange={(e) =>
                    setTypeForm({ ...typeForm, defaultPassingMarks: Number(e.target.value) })
                  }
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-dark" onClick={saveType}>
                {editingTypeId ? "Update Type" : "Create Type"}
              </button>
              {editingTypeId ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditingTypeId("");
                    setTypeForm({ ...emptyTypeForm });
                  }}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </Panel>

          <Panel title="Exam Type Master" meta={`${types.length} TYPES`}>
            {!types.length ? (
              <EmptyState message="No exam types configured." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th className="right">Default Marks</th>
                      <th className="right">Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((t) => (
                      <tr key={t._id}>
                        <td className="num">{t.key}</td>
                        <td>{t.name}</td>
                        <td style={{ textTransform: "capitalize" }}>{t.category}</td>
                        <td className="num">
                          {t.defaultPassingMarks} / {t.defaultMaxMarks}
                        </td>
                        <td className="right">
                          <StatusBadge status={t.isActive ? "active" : "inactive"} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="link-btn" onClick={() => editType(t)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => removeType(t._id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "terms" ? (
        <div className="grid-2">
          <Panel title={editingTermId ? "Edit Term" : "New Term"}>
            <div className="form-grid">
              <div className="field">
                <label>Name</label>
                <input
                  className={inputClass}
                  value={termForm.name}
                  onChange={(e) => setTermForm({ ...termForm, name: e.target.value })}
                  placeholder="Term 1"
                />
              </div>
              <div className="field">
                <label>Academic Year</label>
                <input
                  className={inputClass}
                  value={termForm.academicYear}
                  onChange={(e) => setTermForm({ ...termForm, academicYear: e.target.value })}
                  placeholder="2026-27"
                />
              </div>
              <div className="field">
                <label>Exam Type (optional)</label>
                <select
                  className={inputClass}
                  value={termForm.examTypeId}
                  onChange={(e) => setTermForm({ ...termForm, examTypeId: e.target.value })}
                >
                  <option value="">None</option>
                  {types.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.key} - {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  className={inputClass}
                  value={termForm.status}
                  onChange={(e) =>
                    setTermForm({ ...termForm, status: e.target.value as ExamTermItem["status"] })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div className="field">
                <label>Start Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={termForm.startDate}
                  onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>End Date</label>
                <input
                  type="date"
                  className={inputClass}
                  value={termForm.endDate}
                  onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Weight %</label>
                <input
                  type="number"
                  className={inputClass}
                  value={termForm.weightPercent}
                  onChange={(e) =>
                    setTermForm({ ...termForm, weightPercent: Number(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label>Remarks</label>
                <input
                  className={inputClass}
                  value={termForm.remarks}
                  onChange={(e) => setTermForm({ ...termForm, remarks: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-dark" onClick={saveTerm}>
                {editingTermId ? "Update Term" : "Create Term"}
              </button>
              {editingTermId ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setEditingTermId("");
                    setTermForm({ ...emptyTermForm, academicYear: currentAcademicYear });
                  }}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </Panel>

          <Panel title="Term Register" meta={`${terms.length} TERMS`}>
            {!terms.length ? (
              <EmptyState message="No terms configured." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Term</th>
                      <th>Year</th>
                      <th>Dates</th>
                      <th>Type</th>
                      <th className="right">Weight</th>
                      <th className="right">Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terms.map((t) => {
                      const et =
                        typeof t.examTypeId === "object" && t.examTypeId ? t.examTypeId : null;
                      return (
                        <tr key={t._id}>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td className="num">{t.academicYear}</td>
                          <td>
                            {prettyDate(t.startDate)} - {prettyDate(t.endDate)}
                          </td>
                          <td>{et ? `${et.key} - ${et.name}` : "-"}</td>
                          <td className="num">{t.weightPercent}%</td>
                          <td className="right">
                            <StatusBadge status={t.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button type="button" className="link-btn" onClick={() => editTerm(t)}>
                                Edit
                              </button>
                              <button
                                type="button"
                                className="link-btn danger"
                                onClick={() => removeTerm(t._id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "schedules" ? (
        <>
          <Panel title={editingScheduleId ? "Edit Schedule" : "New Schedule"}>
            <div className="form-grid">
              <div className="field">
                <label>Academic Year</label>
                <input
                  className={inputClass}
                  value={scheduleForm.academicYear}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, academicYear: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label>Term</label>
                <select
                  className={inputClass}
                  value={scheduleForm.termId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, termId: e.target.value })}
                >
                  <option value="">Select term</option>
                  {terms.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} - {t.academicYear}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Class</label>
                <select
                  className={inputClass}
                  value={scheduleForm.classId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, classId: e.target.value })}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} - {c.section}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Exam Type (optional)</label>
                <select
                  className={inputClass}
                  value={scheduleForm.examTypeId}
                  onChange={(e) =>
                    setScheduleForm({ ...scheduleForm, examTypeId: e.target.value })
                  }
                >
                  <option value="">Auto from term</option>
                  {types.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.key} - {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select
                  className={inputClass}
                  value={scheduleForm.status}
                  onChange={(e) =>
                    setScheduleForm({
                      ...scheduleForm,
                      status: e.target.value as "draft" | "published",
                    })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => loadClassSubjects(scheduleForm.classId, scheduleForm.examTypeId)}
                disabled={!scheduleForm.classId}
              >
                Auto-load Subjects
              </button>
              <button type="button" className="btn-dark" onClick={saveSchedule}>
                {editingScheduleId ? "Update Schedule" : "Create Schedule"}
              </button>
              {editingScheduleId ? (
                <button type="button" className="btn-ghost" onClick={resetScheduleForm}>
                  Cancel Edit
                </button>
              ) : null}
            </div>

            {scheduleForm.rows.length ? (
              <div className="table-scroll" style={{ marginTop: 14 }}>
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th className="right">Marks</th>
                      <th>Room</th>
                      <th>Invigilator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleForm.rows.map((r, idx) => (
                      <tr key={`${r.subjectId}-${idx}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {subjects.find((s) => s._id === r.subjectId)?.name || r.subjectId}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {subjects.find((s) => s._id === r.subjectId)?.code || ""}
                          </div>
                        </td>
                        <td>
                          <input
                            type="date"
                            className={inputClass}
                            style={{ padding: "7px 9px" }}
                            value={r.examDate}
                            onChange={(e) => {
                              const rows = [...scheduleForm.rows];
                              rows[idx] = { ...r, examDate: e.target.value };
                              setScheduleForm({ ...scheduleForm, rows });
                            }}
                          />
                        </td>
                        <td>
                          <div style={{ display: "grid", gap: 6 }}>
                            <input
                              type="time"
                              className={inputClass}
                              style={{ padding: "7px 9px" }}
                              value={r.startTime}
                              onChange={(e) => {
                                const rows = [...scheduleForm.rows];
                                rows[idx] = { ...r, startTime: e.target.value };
                                setScheduleForm({ ...scheduleForm, rows });
                              }}
                            />
                            <input
                              type="time"
                              className={inputClass}
                              style={{ padding: "7px 9px" }}
                              value={r.endTime}
                              onChange={(e) => {
                                const rows = [...scheduleForm.rows];
                                rows[idx] = { ...r, endTime: e.target.value };
                                setScheduleForm({ ...scheduleForm, rows });
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "grid", gap: 6 }}>
                            <input
                              type="number"
                              className={inputClass}
                              style={{ padding: "7px 9px" }}
                              value={r.totalMarks}
                              onChange={(e) => {
                                const rows = [...scheduleForm.rows];
                                rows[idx] = { ...r, totalMarks: Number(e.target.value) };
                                setScheduleForm({ ...scheduleForm, rows });
                              }}
                            />
                            <input
                              type="number"
                              className={inputClass}
                              style={{ padding: "7px 9px" }}
                              value={r.passingMarks}
                              onChange={(e) => {
                                const rows = [...scheduleForm.rows];
                                rows[idx] = { ...r, passingMarks: Number(e.target.value) };
                                setScheduleForm({ ...scheduleForm, rows });
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            className={inputClass}
                            style={{ padding: "7px 9px" }}
                            value={r.room}
                            onChange={(e) => {
                              const rows = [...scheduleForm.rows];
                              rows[idx] = { ...r, room: e.target.value };
                              setScheduleForm({ ...scheduleForm, rows });
                            }}
                          />
                        </td>
                        <td>
                          <select
                            className={inputClass}
                            style={{ padding: "7px 9px" }}
                            value={r.invigilatorId}
                            onChange={(e) => {
                              const rows = [...scheduleForm.rows];
                              rows[idx] = { ...r, invigilatorId: e.target.value };
                              setScheduleForm({ ...scheduleForm, rows });
                            }}
                          >
                            <option value="">None</option>
                            {teachers.map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.firstName} {t.lastName}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="Select class and click Auto-load Subjects to build schedule rows." />
            )}
          </Panel>

          <Panel title="Schedule Register" meta={`${schedules.length} SCHEDULES`}>
            {!schedules.length ? (
              <EmptyState message="No schedules created yet." />
            ) : (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Term</th>
                      <th>Academic Year</th>
                      <th className="right">Rows</th>
                      <th className="right">Status</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => {
                      const cls = typeof s.classId === "object" ? s.classId : null;
                      const trm = typeof s.termId === "object" ? s.termId : null;
                      return (
                        <tr key={s._id}>
                          <td>{cls ? `${cls.name}-${cls.section}` : String(s.classId)}</td>
                          <td>{trm ? trm.name : String(s.termId)}</td>
                          <td className="num">{s.academicYear}</td>
                          <td className="num">{s.rows?.length || 0}</td>
                          <td className="right">
                            <StatusBadge status={s.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => editSchedule(s)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="link-btn danger"
                                onClick={() => removeSchedule(s._id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
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
