"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, NameCell, Panel, StatusBadge, inputClass } from "@/components/ui";
import { ExamForm } from "@/components/forms/SchoolForms";
import { ExamCenter, type ExamStep } from "@/components/exams/ExamCenter";
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
  photoSrc,
} from "@/lib/types";

/* ─── local types ─────────────────────────────────────────────── */
type WorkflowTab = "center" | "results" | "types" | "terms";

const CENTER_STEPS: ExamStep[] = ["datesheet", "slips", "marks", "results"];
const OTHER_TABS: WorkflowTab[] = ["results", "types", "terms"];

type MarkComponents = {
  theory: number;
  viva: number;
  assignment: number;
  attendance: number;
  project: number;
};

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

/* ─── helpers ────────────────────────────────────────────────── */
function gradeTone(percent: number) {
  if (percent >= 80) return "present";
  if (percent >= 50) return "leave";
  return "absent";
}

/* ─── empty forms ─────────────────────────────────────────────── */
const emptyTypeForm = {
  key: "", name: "", category: "school" as ExamTypeItem["category"], isActive: true,
  defaultMaxMarks: 100, defaultPassingMarks: 40,
};
const emptyTermForm = {
  name: "", academicYear: "", examTypeId: "", weightPercent: 100,
  status: "draft" as ExamTermItem["status"], startDate: "", endDate: "", remarks: "",
};

/* ─── component ──────────────────────────────────────────────── */
export default function ExamsPage() {
  const [tab, setTab] = useState<WorkflowTab>("center");
  const [step, setStep] = useState<ExamStep>("datesheet");
  const [role, setRole] = useState("");
  // ?tab=marks (an Exam Center step) or ?tab=results (another tab) opens that view directly.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab") || "";
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const myRole = d.user?.role || "";
        setRole(myRole);
        if (CENTER_STEPS.includes(wanted as ExamStep)) setStep(wanted as ExamStep);
        else if (OTHER_TABS.includes(wanted as WorkflowTab)) setTab(wanted as WorkflowTab);
        else if (myRole !== "admin") setStep("marks");
      })
      .catch(() => {});
  }, []);

  // basic data
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExamItem | null>(null);
  const [selectedId, setSelectedId] = useState("");

  // workflow
  const [types, setTypes] = useState<ExamTypeItem[]>([]);
  const [terms, setTerms] = useState<ExamTermItem[]>([]);
  const [typeForm, setTypeForm] = useState({ ...emptyTypeForm });
  const [termForm, setTermForm] = useState({ ...emptyTermForm });
  const [editingTypeId, setEditingTypeId] = useState("");
  const [editingTermId, setEditingTermId] = useState("");
  const [workflowMsg, setWorkflowMsg] = useState("");
  const [workflowErr, setWorkflowErr] = useState("");

  const currentAcademicYear = useMemo(() => {
    const now = new Date().getFullYear();
    return `${now}-${String(now + 1).slice(-2)}`;
  }, []);

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
    const [ty, tm] = await Promise.all([
      fetch("/api/exams/types").then((r) => r.json()),
      fetch("/api/exams/terms").then((r) => r.json()),
    ]);
    setTypes(ty.types || []);
    setTerms(tm.terms || []);
  }, []);

  useEffect(() => {
    load();
    loadWorkflow();
  }, [load, loadWorkflow]);

  async function remove(id: string) {
    if (!confirm("Delete this exam?")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  const selected = useMemo(() => exams.find((e) => e._id === selectedId) ?? exams[0] ?? null, [exams, selectedId]);

  /* ─── workflow helpers ───────────────────────────────────────── */
  function clearWorkflowAlerts() { setWorkflowErr(""); setWorkflowMsg(""); }

  async function saveType() {
    clearWorkflowAlerts();
    const method = editingTypeId ? "PUT" : "POST";
    const url = editingTypeId ? `/api/exams/types/${editingTypeId}` : "/api/exams/types";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(typeForm) });
    const data = await res.json();
    if (!res.ok) { setWorkflowErr(data.error || "Failed to save exam type"); return; }
    setTypeForm({ ...emptyTypeForm });
    setEditingTypeId("");
    setWorkflowMsg(editingTypeId ? "Exam type updated." : "Exam type created.");
    await loadWorkflow();
  }

  function editType(item: ExamTypeItem) {
    clearWorkflowAlerts();
    setEditingTypeId(item._id);
    setTypeForm({ key: item.key, name: item.name, category: item.category, isActive: item.isActive, defaultMaxMarks: item.defaultMaxMarks, defaultPassingMarks: item.defaultPassingMarks });
  }

  async function removeType(id: string) {
    if (!confirm("Delete this exam type?")) return;
    clearWorkflowAlerts();
    const res = await fetch(`/api/exams/types/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setWorkflowErr(data.error || "Failed to delete exam type"); return; }
    setWorkflowMsg("Exam type deleted.");
    await loadWorkflow();
  }

  async function saveTerm() {
    clearWorkflowAlerts();
    const method = editingTermId ? "PUT" : "POST";
    const url = editingTermId ? `/api/exams/terms/${editingTermId}` : "/api/exams/terms";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...termForm, examTypeId: termForm.examTypeId || null }) });
    const data = await res.json();
    if (!res.ok) { setWorkflowErr(data.error || "Failed to save term"); return; }
    setTermForm({ ...emptyTermForm, academicYear: currentAcademicYear });
    setEditingTermId("");
    setWorkflowMsg(editingTermId ? "Term updated." : "Term created.");
    await loadWorkflow();
  }

  function editTerm(item: ExamTermItem) {
    clearWorkflowAlerts();
    setEditingTermId(item._id);
    setTermForm({ name: item.name, academicYear: item.academicYear, examTypeId: idOf(item.examTypeId as never), weightPercent: item.weightPercent, status: item.status, startDate: (item.startDate || "").slice(0, 10), endDate: (item.endDate || "").slice(0, 10), remarks: item.remarks || "" });
  }

  async function removeTerm(id: string) {
    if (!confirm("Delete this term?")) return;
    clearWorkflowAlerts();
    const res = await fetch(`/api/exams/terms/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setWorkflowErr(data.error || "Failed to delete term"); return; }
    setWorkflowMsg("Term deleted.");
    await loadWorkflow();
  }

  /* ─── render ─────────────────────────────────────────────────── */
  return (
    <>
      <Hero
        title="Exams & Results"
        subtitle="Exam Center: date sheet → roll number slips → marks → result cards — each teacher enters their own papers, all compiled into one result"
        actionLabel={tab === "results" ? "Quick Exam" : undefined}
        onAction={tab === "results" ? () => { setEditing(null); setOpen(true); } : undefined}
      />

      <div className="tabs">
        <button type="button" className={`tab${tab === "center" ? " active" : ""}`} onClick={() => setTab("center")}>Exam Center</button>
        <button type="button" className={`tab${tab === "results" ? " active" : ""}`} onClick={() => setTab("results")}>Results Register</button>
        <button type="button" className={`tab${tab === "types" ? " active" : ""}`} onClick={() => setTab("types")}>Exam Types</button>
        <button type="button" className={`tab${tab === "terms" ? " active" : ""}`} onClick={() => setTab("terms")}>Terms</button>
      </div>

      {workflowErr ? <div className="alert err">{workflowErr}</div> : null}
      {workflowMsg ? <div className="alert ok">{workflowMsg}</div> : null}

      {tab === "center" && role ? <ExamCenter step={step} onStep={setStep} role={role} /> : null}

      {/* ── MARK SHEET TAB ─────────────────────────────────────── */}
      {tab === "results" ? (
        <>
          {!exams.length ? <EmptyState message="No results yet. Enter marks in Exam Center → Marks Entry, or add a class test with Quick Exam." /> : null}
          <div className="grid-2">
            <Panel title="Exam List" meta={`${exams.length} TOTAL`}>
              {exams.map((exam) => {
                const d = dayMonth(exam.date);
                const upcoming = new Date(exam.date) >= new Date();
                return (
                  <div className="exam-card" key={exam._id} onClick={() => setSelectedId(exam._id)} style={{ cursor: "pointer", borderColor: selected?._id === exam._id ? "var(--jade)" : "var(--line)" }}>
                    <div className="exam-date"><b>{d.day}</b><span>{d.month}</span></div>
                    <div className="exam-info">
                      <div className="et">{exam.title}</div>
                      <div className="es">{labelOfClass(exam.classId as never)} · {typeof exam.subjectId === "object" ? exam.subjectId.name : exam.subjectId} · {exam.maxMarks} marks</div>
                    </div>
                    <span className={`badge ${upcoming ? "leave" : "present"}`}>{upcoming ? "upcoming" : exam.examType}</span>
                    <div className="row-actions">
                      <button type="button" className="link-btn" onClick={(ev) => { ev.stopPropagation(); setEditing(exam); setOpen(true); }}>Edit</button>
                      <button type="button" className="link-btn danger" onClick={(ev) => { ev.stopPropagation(); remove(exam._id); }}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </Panel>

            <Panel title="Exam Summary">
              {selected ? (
                <>
                  <div className="fee-row"><span>Exam</span><span style={{ fontWeight: 600 }}>{selected.title}</span></div>
                  <div className="fee-row"><span>Class</span><span>{labelOfClass(selected.classId as never)}</span></div>
                  <div className="fee-row"><span>Subject</span><span>{typeof selected.subjectId === "object" ? selected.subjectId.name : selected.subjectId}</span></div>
                  <div className="fee-row"><span>Date</span><span className="mono">{prettyDate(selected.date)}</span></div>
                  <div className="fee-row"><span>Results entered</span><span className="mono">{selected.results?.length ?? 0}</span></div>
                  <div className="fee-row total"><span>TOTAL MARKS</span><span>{selected.maxMarks}</span></div>
                </>
              ) : (
                <EmptyState message="Select an exam to view details." />
              )}
            </Panel>
          </div>

          <Panel title={selected ? `Result Sheet — ${selected.title}` : "Result Sheet"} meta={selected ? labelOfClass(selected.classId as never).toUpperCase() : undefined}>
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="right">Theory</th>
                    <th className="right">Viva</th>
                    <th className="right">Asn</th>
                    <th className="right">Att</th>
                    <th className="right">Proj</th>
                    <th className="right">Total</th>
                    <th className="right">%</th>
                    <th className="right">Grade</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {(selected?.results ?? []).map((r, i) => {
                    const student = typeof r.studentId === "object" ? (r.studentId as StudentItem) : students.find((s) => s._id === r.studentId);
                    const pct = selected?.maxMarks ? Math.round((r.marks / selected.maxMarks) * 100) : 0;
                    const c = (r as { components?: Partial<MarkComponents> }).components;
                    return (
                      <tr key={`${selected?._id}-${i}`}>
                        <td><NameCell name={student ? fullName(student) : "Unknown"} sub={student?.admissionNo} photo={student ? photoSrc("student", student) : null} /></td>
                        <td className="num">{c?.theory ?? "—"}</td>
                        <td className="num">{c?.viva ?? "—"}</td>
                        <td className="num">{c?.assignment ?? "—"}</td>
                        <td className="num">{c?.attendance ?? "—"}</td>
                        <td className="num">{c?.project ?? "—"}</td>
                        <td className="num">{r.marks} / {selected?.maxMarks}</td>
                        <td className="num">{pct}%</td>
                        <td className="right"><span className={`badge ${gradeTone(pct)}`}>{r.grade || "—"}</span></td>
                        <td>{r.remarks || "—"}</td>
                      </tr>
                    );
                  })}
                  {!selected?.results?.length ? (
                    <tr><td colSpan={10} style={{ color: "var(--text-dim)", padding: "22px 0" }}>No results for this exam. Enter marks in Exam Center → Marks Entry.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}

      {/* ── EXAM TYPES TAB ─────────────────────────────────────── */}
      {tab === "types" ? (
        <div className="grid-2">
          <Panel title={editingTypeId ? "Edit Exam Type" : "New Exam Type"}>
            <div className="form-grid">
              <div className="field"><label>Key</label><input className={inputClass} value={typeForm.key} onChange={(e) => setTypeForm({ ...typeForm, key: e.target.value })} placeholder="MIDTERM" /></div>
              <div className="field"><label>Name</label><input className={inputClass} value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} placeholder="Midterm" /></div>
              <div className="field"><label>Category</label>
                <select className={inputClass} value={typeForm.category} onChange={(e) => setTypeForm({ ...typeForm, category: e.target.value as ExamTypeItem["category"] })}>
                  <option value="school">School</option><option value="college">College</option><option value="university">University</option><option value="custom">Custom</option>
                </select>
              </div>
              <div className="field"><label>Status</label>
                <select className={inputClass} value={typeForm.isActive ? "active" : "inactive"} onChange={(e) => setTypeForm({ ...typeForm, isActive: e.target.value === "active" })}>
                  <option value="active">Active</option><option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="field"><label>Default Total Marks</label><input type="number" className={inputClass} value={typeForm.defaultMaxMarks} onChange={(e) => setTypeForm({ ...typeForm, defaultMaxMarks: Number(e.target.value) })} /></div>
              <div className="field"><label>Default Passing Marks</label><input type="number" className={inputClass} value={typeForm.defaultPassingMarks} onChange={(e) => setTypeForm({ ...typeForm, defaultPassingMarks: Number(e.target.value) })} /></div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-dark" onClick={saveType}>{editingTypeId ? "Update Type" : "Create Type"}</button>
              {editingTypeId && <button type="button" className="btn-ghost" onClick={() => { setEditingTypeId(""); setTypeForm({ ...emptyTypeForm }); }}>Cancel</button>}
            </div>
          </Panel>
          <Panel title="Exam Type Master" meta={`${types.length} TYPES`}>
            {!types.length ? <EmptyState message="No exam types configured." /> : (
              <div className="table-scroll">
                <table className="reg">
                  <thead><tr><th>Key</th><th>Name</th><th>Category</th><th className="right">Pass / Total</th><th className="right">Status</th><th className="right">Actions</th></tr></thead>
                  <tbody>
                    {types.map((t) => (
                      <tr key={t._id}>
                        <td className="num">{t.key}</td><td>{t.name}</td>
                        <td style={{ textTransform: "capitalize" }}>{t.category}</td>
                        <td className="num">{t.defaultPassingMarks} / {t.defaultMaxMarks}</td>
                        <td className="right"><StatusBadge status={t.isActive ? "active" : "inactive"} /></td>
                        <td><div className="row-actions"><button type="button" className="link-btn" onClick={() => editType(t)}>Edit</button><button type="button" className="link-btn danger" onClick={() => removeType(t._id)}>Delete</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      ) : null}

      {/* ── TERMS TAB ──────────────────────────────────────────── */}
      {tab === "terms" ? (
        <div className="grid-2">
          <Panel title={editingTermId ? "Edit Term" : "New Term"}>
            <div className="form-grid">
              <div className="field"><label>Name</label><input className={inputClass} value={termForm.name} onChange={(e) => setTermForm({ ...termForm, name: e.target.value })} placeholder="Term 1" /></div>
              <div className="field"><label>Academic Year</label><input className={inputClass} value={termForm.academicYear} onChange={(e) => setTermForm({ ...termForm, academicYear: e.target.value })} placeholder="2026-27" /></div>
              <div className="field"><label>Exam Type (optional)</label>
                <select className={inputClass} value={termForm.examTypeId} onChange={(e) => setTermForm({ ...termForm, examTypeId: e.target.value })}>
                  <option value="">None</option>
                  {types.map((t) => <option key={t._id} value={t._id}>{t.key} - {t.name}</option>)}
                </select>
              </div>
              <div className="field"><label>Status</label>
                <select className={inputClass} value={termForm.status} onChange={(e) => setTermForm({ ...termForm, status: e.target.value as ExamTermItem["status"] })}>
                  <option value="draft">Draft</option><option value="active">Active</option><option value="closed">Closed</option>
                </select>
              </div>
              <div className="field"><label>Start Date</label><input type="date" className={inputClass} value={termForm.startDate} onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })} /></div>
              <div className="field"><label>End Date</label><input type="date" className={inputClass} value={termForm.endDate} onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })} /></div>
              <div className="field"><label>Weight %</label><input type="number" className={inputClass} value={termForm.weightPercent} onChange={(e) => setTermForm({ ...termForm, weightPercent: Number(e.target.value) })} /></div>
              <div className="field"><label>Remarks</label><input className={inputClass} value={termForm.remarks} onChange={(e) => setTermForm({ ...termForm, remarks: e.target.value })} /></div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn-dark" onClick={saveTerm}>{editingTermId ? "Update Term" : "Create Term"}</button>
              {editingTermId && <button type="button" className="btn-ghost" onClick={() => { setEditingTermId(""); setTermForm({ ...emptyTermForm, academicYear: currentAcademicYear }); }}>Cancel</button>}
            </div>
          </Panel>
          <Panel title="Term Register" meta={`${terms.length} TERMS`}>
            {!terms.length ? <EmptyState message="No terms configured." /> : (
              <div className="table-scroll">
                <table className="reg">
                  <thead><tr><th>Term</th><th>Year</th><th>Dates</th><th>Type</th><th className="right">Weight</th><th className="right">Status</th><th className="right">Actions</th></tr></thead>
                  <tbody>
                    {terms.map((t) => {
                      const et = typeof t.examTypeId === "object" && t.examTypeId ? t.examTypeId : null;
                      return (
                        <tr key={t._id}>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td className="num">{t.academicYear}</td>
                          <td>{prettyDate(t.startDate)} – {prettyDate(t.endDate)}</td>
                          <td>{et ? `${et.key} - ${et.name}` : "—"}</td>
                          <td className="num">{t.weightPercent}%</td>
                          <td className="right"><StatusBadge status={t.status} /></td>
                          <td><div className="row-actions"><button type="button" className="link-btn" onClick={() => editTerm(t)}>Edit</button><button type="button" className="link-btn danger" onClick={() => removeTerm(t._id)}>Delete</button></div></td>
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
