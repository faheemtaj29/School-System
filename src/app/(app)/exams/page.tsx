"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

/* ─── local types ─────────────────────────────────────────────── */
type WorkflowTab = "results" | "marksheet" | "schedules" | "types" | "terms";

type MarkComponents = {
  theory: number;
  viva: number;
  assignment: number;
  attendance: number;
  project: number;
};

const COMP_KEYS: (keyof MarkComponents)[] = ["theory", "viva", "assignment", "attendance", "project"];
const COMP_LABEL: Record<keyof MarkComponents, string> = {
  theory: "Theory",
  viva: "Viva",
  assignment: "Asn",
  attendance: "Att",
  project: "Proj",
};

const DEFAULT_COMP: MarkComponents = { theory: 60, viva: 10, assignment: 10, attendance: 10, project: 10 };

type SheetSubject = {
  subjectId: string;
  name: string;
  code?: string;
  maxMarks: number;
  markComponents: MarkComponents;
};

type SheetRow = {
  studentId: string;
  name: string;
  rollNumber: string;
  admissionNo: string;
  marks: Record<string, MarkComponents>; // subjectId → components
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
type CurrentRole = "admin" | "teacher" | "staff" | "student" | "parent";

/* ─── helpers ────────────────────────────────────────────────── */
function gradeTone(percent: number) {
  if (percent >= 80) return "present";
  if (percent >= 50) return "leave";
  return "absent";
}

function sumComp(c: MarkComponents) {
  return c.theory + c.viva + c.assignment + c.attendance + c.project;
}

function grade(pct: number) {
  if (pct >= 90) return "A+";
  if (pct >= 80) return "A";
  if (pct >= 70) return "B+";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  return "F";
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
  const [tab, setTab] = useState<WorkflowTab>("marksheet");
  const [userRole, setUserRole] = useState<CurrentRole | null>(null);

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
  const [schedules, setSchedules] = useState<ExamScheduleItem[]>([]);
  const [typeForm, setTypeForm] = useState({ ...emptyTypeForm });
  const [termForm, setTermForm] = useState({ ...emptyTermForm });
  const [editingTypeId, setEditingTypeId] = useState("");
  const [editingTermId, setEditingTermId] = useState("");
  const [editingScheduleId, setEditingScheduleId] = useState("");
  const [workflowMsg, setWorkflowMsg] = useState("");
  const [workflowErr, setWorkflowErr] = useState("");

  // mark sheet state
  const [sheetClassId, setSheetClassId] = useState("");
  const [sheetSubjectId, setSheetSubjectId] = useState("");
  const [sheetScheduleId, setSheetScheduleId] = useState("");
  const [sheetExamType, setSheetExamType] = useState<"quiz" | "midterm" | "final" | "assignment">("final");
  const [sheetDate, setSheetDate] = useState("");
  const [sheetTermLabel, setSheetTermLabel] = useState("");
  const [sheetSubjects, setSheetSubjects] = useState<SheetSubject[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [sheetLoaded, setSheetLoaded] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetSaving, setSheetSaving] = useState(false);
  const [sheetMsg, setSheetMsg] = useState("");
  const [savedStudentIds, setSavedStudentIds] = useState<string[]>([]);

  const currentAcademicYear = useMemo(() => {
    const now = new Date().getFullYear();
    return `${now}-${String(now + 1).slice(-2)}`;
  }, []);

  const [scheduleForm, setScheduleForm] = useState<{
    academicYear: string; termId: string; examTypeId: string; classId: string;
    status: "draft" | "published";
    rows: { subjectId: string; examDate: string; startTime: string; endTime: string; totalMarks: number; passingMarks: number; room: string; invigilatorId: string; instructions: string; status: "draft" | "published" }[];
  }>({ academicYear: currentAcademicYear, termId: "", examTypeId: "", classId: "", status: "draft", rows: [] });

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
    load();
    loadWorkflow();
    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => setUserRole(data.user?.role || null))
      .catch(() => setUserRole(null));
  }, [load, loadWorkflow]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab && ["results", "marksheet", "schedules", "types", "terms"].includes(requestedTab)) {
      setTab(requestedTab as WorkflowTab);
    }
    setSheetClassId(params.get("classId") || "");
    setSheetSubjectId(params.get("subjectId") || "");
    setSheetScheduleId(params.get("scheduleId") || "");
    const examType = params.get("examType")?.toLowerCase();
    if (examType && ["quiz", "midterm", "final", "assignment"].includes(examType)) {
      setSheetExamType(examType as typeof sheetExamType);
    }
    setSheetDate(params.get("date") || "");
    setSheetTermLabel(params.get("term") || "");
  }, []);

  useEffect(() => {
    if (userRole === "teacher" && (tab === "types" || tab === "terms")) {
      setTab("schedules");
    }
  }, [userRole, tab]);

  async function remove(id: string) {
    if (!confirm("Delete this exam?")) return;
    await fetch(`/api/exams/${id}`, { method: "DELETE" });
    load();
  }

  const selected = useMemo(() => exams.find((e) => e._id === selectedId) ?? exams[0] ?? null, [exams, selectedId]);

  /* ─── marksheet ─────────────────────────────────────────────── */
  const sheetClass = useMemo(() => classes.find((c) => c._id === sheetClassId) ?? null, [classes, sheetClassId]);

  // sections of the same class name
  const sheetSections = useMemo(() => {
    if (!sheetClass) return [];
    return classes.filter((c) => c.name === sheetClass.name);
  }, [classes, sheetClass]);

  async function loadSheet() {
    if (!sheetClassId) return;
    setSheetLoading(true);
    setSheetMsg("");
    const params = new URLSearchParams({ classId: sheetClassId });
    if (sheetSubjectId) params.set("subjectId", sheetSubjectId);
    if (sheetScheduleId) params.set("scheduleId", sheetScheduleId);
    const res = await fetch(`/api/exams/marksheet?${params}`);
    const data = await res.json();
    setSheetLoading(false);
    if (!res.ok) { setSheetMsg(data.error || "Failed to load sheet"); return; }

    const classSubjects: SubjectItem[] = data.subjects || data.cls?.subjects || [];
    const classSubs: SheetSubject[] = classSubjects.map((s) => ({
      subjectId: s._id,
      name: s.name,
      code: s.code,
      maxMarks: data.scheduleRow?.totalMarks || 100,
      markComponents: data.scheduleRow
        ? { theory: data.scheduleRow.totalMarks, viva: 0, assignment: 0, attendance: 0, project: 0 }
        : { ...DEFAULT_COMP },
    }));

    const classStudents: { _id: string; firstName: string; lastName: string; rollNumber?: string; admissionNo: string }[] = data.students || [];

    // pre-fill existing marks from exams
    const existingExams: { subjectId: { _id: string } | string; maxMarks: number; markComponents?: Partial<MarkComponents>; results: { studentId: { _id: string } | string; marks: number; components?: Partial<MarkComponents> }[] }[] = data.exams || [];
    const examBySubject = new Map<string, typeof existingExams[0]>();
    for (const ex of existingExams) {
      const sid = typeof ex.subjectId === "object" ? ex.subjectId._id : ex.subjectId;
      examBySubject.set(sid, ex);
    }

    // update max marks from existing exams
    for (const sub of classSubs) {
      const ex = examBySubject.get(sub.subjectId);
      if (ex) {
        sub.maxMarks = ex.maxMarks || 100;
        if (ex.markComponents) {
          sub.markComponents = { ...DEFAULT_COMP, ...ex.markComponents };
        }
      }
    }

    const rows: SheetRow[] = classStudents.map((stu) => {
      const rowMarks: Record<string, MarkComponents> = {};
      for (const sub of classSubs) {
        const ex = examBySubject.get(sub.subjectId);
        const result = ex?.results.find((r) => {
          const rid = typeof r.studentId === "object" ? r.studentId._id : r.studentId;
          return rid === stu._id;
        });
        rowMarks[sub.subjectId] = result?.components
          ? { ...DEFAULT_COMP, ...result.components }
          : { theory: 0, viva: 0, assignment: 0, attendance: 0, project: 0 };
      }
      return {
        studentId: stu._id,
        name: `${stu.firstName} ${stu.lastName}`,
        rollNumber: stu.rollNumber || "",
        admissionNo: stu.admissionNo,
        marks: rowMarks,
      };
    });

    setSheetSubjects(classSubs);
    setSheetRows(rows);
    setSavedStudentIds(
      [...new Set(existingExams.flatMap((exam) => exam.results.map((result) =>
        typeof result.studentId === "object" ? result.studentId._id : result.studentId
      )))]
    );
    setSheetLoaded(true);
    if (!sheetDate) setSheetDate(new Date().toISOString().slice(0, 10));
  }

  function updateCompMax(subjectId: string, key: keyof MarkComponents, val: number) {
    setSheetSubjects((prev) =>
      prev.map((s) => s.subjectId === subjectId ? { ...s, markComponents: { ...s.markComponents, [key]: val }, maxMarks: Object.values({ ...s.markComponents, [key]: val }).reduce((a, b) => a + b, 0) } : s)
    );
  }

  function updateStudentComp(studentId: string, subjectId: string, key: keyof MarkComponents, val: number) {
    setSheetRows((prev) =>
      prev.map((r) =>
        r.studentId === studentId
          ? { ...r, marks: { ...r.marks, [subjectId]: { ...r.marks[subjectId], [key]: val } } }
          : r
      )
    );
  }

  async function saveSheet() {
    if (!sheetClassId || !sheetDate || !sheetSubjects.length) return;
    setSheetSaving(true);
    setSheetMsg("");
    const sheetClassObj = classes.find((c) => c._id === sheetClassId);
    const payload = {
      classId: sheetClassId,
      scheduleId: sheetScheduleId || undefined,
      academicYear: sheetClassObj?.academicYear || currentAcademicYear,
      termLabel: sheetTermLabel || undefined,
      examType: sheetExamType,
      date: sheetDate,
      subjects: sheetSubjects.map((sub) => ({
        subjectId: sub.subjectId,
        maxMarks: sub.maxMarks,
        markComponents: sub.markComponents,
        students: sheetRows.map((row) => ({
          studentId: row.studentId,
          components: row.marks[sub.subjectId] || { theory: 0, viva: 0, assignment: 0, attendance: 0, project: 0 },
        })),
      })),
    };
    const res = await fetch("/api/exams/marksheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSheetSaving(false);
    if (!res.ok) { setSheetMsg(data.error || "Save failed"); return; }
    await loadSheet();
    setSheetMsg(`Saved ${data.saved} subject(s). Marks recorded.`);
    load();
  }

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

  async function loadClassSubjects(classId: string, examTypeId: string) {
    clearWorkflowAlerts();
    if (!classId) return;
    const subRes = await fetch(`/api/exams/schedules?view=subjects&classId=${classId}`);
    const subData = await subRes.json();
    if (!subRes.ok) { setWorkflowErr(subData.error || "Could not load class subjects"); return; }
    const selectedType = types.find((t) => t._id === examTypeId);
    const rows = (subData.subjects || []).map((s: SubjectItem) => ({ subjectId: s._id, examDate: "", startTime: "", endTime: "", totalMarks: selectedType?.defaultMaxMarks || 100, passingMarks: selectedType?.defaultPassingMarks || 40, room: "", invigilatorId: "", instructions: "", status: "draft" as const }));
    setScheduleForm((prev) => ({ ...prev, rows }));
    setWorkflowMsg(`Loaded ${rows.length} subjects.`);
  }

  function resetScheduleForm() {
    setEditingScheduleId("");
    setScheduleForm({ academicYear: currentAcademicYear, termId: "", examTypeId: "", classId: "", status: "draft", rows: [] });
  }

  function editSchedule(item: ExamScheduleItem) {
    clearWorkflowAlerts();
    setEditingScheduleId(item._id);
    setScheduleForm({ academicYear: item.academicYear, termId: idOf(item.termId as never), examTypeId: idOf(item.examTypeId as never), classId: idOf(item.classId as never), status: item.status, rows: (item.rows || []).map((r) => ({ subjectId: idOf(r.subjectId as never), examDate: (r.examDate || "").slice(0, 10), startTime: r.startTime || "", endTime: r.endTime || "", totalMarks: r.totalMarks, passingMarks: r.passingMarks, room: r.room || "", invigilatorId: idOf(r.invigilatorId as never), instructions: r.instructions || "", status: r.status })) });
  }

  async function saveSchedule() {
    clearWorkflowAlerts();
    const method = editingScheduleId ? "PUT" : "POST";
    const url = editingScheduleId ? `/api/exams/schedules/${editingScheduleId}` : "/api/exams/schedules";
    const payload = { ...scheduleForm, examTypeId: scheduleForm.examTypeId || null, rows: scheduleForm.rows.map((r) => ({ ...r, examDate: r.examDate || null, startTime: r.startTime || null, endTime: r.endTime || null, invigilatorId: r.invigilatorId || null })) };
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setWorkflowErr(data.error || "Failed to save schedule"); return; }
    setWorkflowMsg(editingScheduleId ? "Schedule updated." : "Schedule created.");
    resetScheduleForm();
    await loadWorkflow();
  }

  async function removeSchedule(id: string) {
    if (!confirm("Delete this schedule?")) return;
    clearWorkflowAlerts();
    const res = await fetch(`/api/exams/schedules/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setWorkflowErr(data.error || "Failed to delete schedule"); return; }
    setWorkflowMsg("Schedule deleted.");
    await loadWorkflow();
  }

  /* ─── render ─────────────────────────────────────────────────── */
  return (
    <>
      <Hero
        title="Exams & Results"
        subtitle="Schedule exams · Enter marks by component · View result sheets"
        actionLabel={userRole === "admin" && tab === "results" ? "Quick Exam" : undefined}
        onAction={userRole === "admin" && tab === "results" ? () => { setEditing(null); setOpen(true); } : undefined}
      />

      <div className="tabs">
        <button type="button" className={`tab${tab === "marksheet" ? " active" : ""}`} onClick={() => setTab("marksheet")}>Mark Sheet</button>
        <button type="button" className={`tab${tab === "schedules" ? " active" : ""}`} onClick={() => setTab("schedules")}>Exam Schedule</button>
        <button type="button" className={`tab${tab === "results" ? " active" : ""}`} onClick={() => setTab("results")}>Results Register</button>
        {userRole !== "teacher" ? (
          <>
            <button type="button" className={`tab${tab === "types" ? " active" : ""}`} onClick={() => setTab("types")}>Exam Types</button>
            <button type="button" className={`tab${tab === "terms" ? " active" : ""}`} onClick={() => setTab("terms")}>Terms</button>
          </>
        ) : null}
      </div>

      {workflowErr ? <div className="alert err">{workflowErr}</div> : null}
      {workflowMsg ? <div className="alert ok">{workflowMsg}</div> : null}

      {/* ── MARK SHEET TAB ─────────────────────────────────────── */}
      {tab === "marksheet" ? (
        <>
          <Panel title="Mark Sheet Setup">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Class
                <select
                  className={inputClass}
                  style={{ minWidth: 200 }}
                  value={sheetClassId}
                  disabled={userRole === "teacher" && Boolean(sheetScheduleId)}
                  onChange={(e) => { setSheetClassId(e.target.value); setSheetScheduleId(""); setSheetSubjectId(""); setSheetLoaded(false); setSheetMsg(""); }}
                >
                  <option value="">— select class —</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} – {c.section} · {c.academicYear}
                    </option>
                  ))}
                </select>
              </label>

              {sheetClass && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "flex-end", paddingBottom: 6 }}>
                  Sections of {sheetClass.name} ({sheetClass.academicYear}):{" "}
                  <b>{sheetSections.map((s) => s.section).join(", ")}</b>
                </div>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Exam Type
                <select className={inputClass} value={sheetExamType} disabled={userRole === "teacher"} onChange={(e) => setSheetExamType(e.target.value as typeof sheetExamType)}>
                  <option value="final">Final</option>
                  <option value="midterm">Midterm</option>
                  <option value="quiz">Quiz</option>
                  <option value="assignment">Assignment</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Term / Label
                <input className={inputClass} placeholder="e.g. Annual 2025" value={sheetTermLabel} disabled={userRole === "teacher"} onChange={(e) => setSheetTermLabel(e.target.value)} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Exam Date
                <input type="date" className={inputClass} value={sheetDate} disabled={userRole === "teacher"} onChange={(e) => setSheetDate(e.target.value)} />
              </label>

              <button
                type="button"
                className="btn-primary"
                disabled={!sheetClassId || sheetLoading || (userRole === "teacher" && !sheetScheduleId)}
                onClick={loadSheet}
                style={{ alignSelf: "flex-end" }}
              >
                {sheetLoading ? "Loading…" : "Load Sheet"}
              </button>
            </div>
          </Panel>

          {userRole === "teacher" && !sheetScheduleId ? (
            <div className="alert">Select a published exam from the <Link href="/exams?tab=schedules">exam schedule</Link> to enter marks for its assigned subject.</div>
          ) : null}

          {sheetLoaded && sheetSubjects.length > 0 && (
            <>
              {/* Max marks config per subject */}
              <Panel title="Marks Distribution (Max per subject)">
                <div className="table-scroll">
                  <table className="reg">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        {COMP_KEYS.map((k) => <th key={k} className="right">{COMP_LABEL[k]}</th>)}
                        <th className="right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetSubjects.map((sub) => (
                        <tr key={sub.subjectId}>
                          <td style={{ fontWeight: 600 }}>{sub.name} {sub.code ? <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>({sub.code})</span> : null}</td>
                          {COMP_KEYS.map((k) => (
                            <td key={k} className="right">
                              <input
                                type="number"
                                style={{ width: 55, padding: "4px 6px", textAlign: "right", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                                value={sub.markComponents[k]}
                                min={0}
                                onChange={(e) => updateCompMax(sub.subjectId, k, Number(e.target.value))}
                              />
                            </td>
                          ))}
                          <td className="right" style={{ fontWeight: 700 }}>{sub.maxMarks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              {/* Marks entry grid */}
              <Panel
                title={`Marks Entry — ${sheetClass?.name}-${sheetClass?.section}`}
                meta={`${sheetRows.length} STUDENTS · ${sheetSubjects.length} SUBJECTS · ${sheetRows.filter((row) => !savedStudentIds.includes(row.studentId)).length} MISSING`}
              >
                {sheetMsg && (
                  <div className={`alert ${sheetMsg.startsWith("Saved") ? "ok" : sheetMsg.startsWith("Error:") ? "err" : ""}`} style={{ marginBottom: 12 }}>{sheetMsg}</div>
                )}
                <div className="table-scroll">
                  <table className="reg" style={{ fontSize: 11.5, minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Roll #</th>
                        <th rowSpan={2} style={{ verticalAlign: "bottom" }}>Student</th>
                        {sheetSubjects.map((sub) => (
                          <th key={sub.subjectId} colSpan={COMP_KEYS.length + 1} style={{ textAlign: "center", borderLeft: "2px solid var(--border)", background: "var(--bg-soft, #f5f5f5)" }}>
                            {sub.name}
                            <span style={{ display: "block", fontWeight: 400, color: "var(--text-dim)", fontSize: 10 }}>/{sub.maxMarks}</span>
                          </th>
                        ))}
                        <th rowSpan={2} style={{ textAlign: "right", verticalAlign: "bottom", borderLeft: "2px solid var(--border)" }}>Grand<br />Total</th>
                        <th rowSpan={2} style={{ textAlign: "right", verticalAlign: "bottom" }}>%</th>
                        <th rowSpan={2} style={{ textAlign: "right", verticalAlign: "bottom" }}>Result</th>
                      </tr>
                      <tr>
                        {sheetSubjects.map((sub) => (
                          <React.Fragment key={sub.subjectId}>
                            {COMP_KEYS.map((k) => (
                              <th key={`${sub.subjectId}-${k}`} style={{ textAlign: "right", fontWeight: 500, color: "var(--text-dim)", borderLeft: k === "theory" ? "2px solid var(--border)" : undefined }}>
                                {COMP_LABEL[k]}<br /><span style={{ fontSize: 9 }}>/{sub.markComponents[k]}</span>
                              </th>
                            ))}
                            <th style={{ textAlign: "right", fontWeight: 700 }}>Tot</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.map((row) => {
                        const grandTotal = sheetSubjects.reduce((sum, sub) => sum + sumComp(row.marks[sub.subjectId] || { theory: 0, viva: 0, assignment: 0, attendance: 0, project: 0 }), 0);
                        const grandMax = sheetSubjects.reduce((sum, sub) => sum + sub.maxMarks, 0);
                        const pct = grandMax > 0 ? Math.round((grandTotal / grandMax) * 100) : 0;
                        return (
                          <tr key={row.studentId}>
                            <td className="num">{row.rollNumber || "—"}</td>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 12 }}>{row.name}</div>
                              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{row.admissionNo}</div>
                            </td>
                            {sheetSubjects.map((sub) => {
                              const comp = row.marks[sub.subjectId] || { theory: 0, viva: 0, assignment: 0, attendance: 0, project: 0 };
                              const subTotal = sumComp(comp);
                              return (
                                <>
                                  {COMP_KEYS.map((k) => (
                                    <td key={`${row.studentId}-${sub.subjectId}-${k}`} style={{ borderLeft: k === "theory" ? "2px solid var(--border)" : undefined, padding: "2px 3px" }}>
                                      <input
                                        type="number"
                                        min={0}
                                        max={sub.markComponents[k]}
                                        style={{ width: 44, padding: "3px 4px", textAlign: "right", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11 }}
                                        value={comp[k]}
                                        onChange={(e) => updateStudentComp(row.studentId, sub.subjectId, k, Number(e.target.value))}
                                      />
                                    </td>
                                  ))}
                                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 12 }}>{subTotal}</td>
                                </>
                              );
                            })}
                            <td style={{ textAlign: "right", fontWeight: 700, borderLeft: "2px solid var(--border)" }}>{grandTotal}/{grandMax}</td>
                            <td style={{ textAlign: "right" }}>{pct}%</td>
                            <td style={{ textAlign: "right" }}>
                              <span className={`badge ${gradeTone(pct)}`}>{grade(pct)}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {!sheetRows.length && (
                        <tr><td colSpan={99} style={{ color: "var(--text-dim)", padding: "20px 0", textAlign: "center" }}>No students in this class.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                  <button type="button" className="btn-primary" disabled={sheetSaving || !sheetDate} onClick={saveSheet}>
                    {sheetSaving ? "Saving…" : "Save Mark Sheet"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => { setSheetLoaded(false); setSheetSubjects([]); setSheetRows([]); setSheetMsg(""); }}>
                    Reset
                  </button>
                </div>
              </Panel>
            </>
          )}

          {sheetLoaded && !sheetSubjects.length && (
            <EmptyState message="This class has no subjects mapped. Go to Classes & Sections and assign subjects." />
          )}
        </>
      ) : null}

      {/* ── EXAM SCHEDULE TAB ──────────────────────────────────── */}
      {tab === "schedules" ? (
        <>
          {userRole === "admin" ? <Panel title={editingScheduleId ? "Edit Schedule" : "New Exam Schedule"}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Class *
                <select
                  className={inputClass}
                  style={{ minWidth: 200 }}
                  value={scheduleForm.classId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, classId: e.target.value })}
                >
                  <option value="">Select class</option>
                  {classes.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} – {c.section} · {c.academicYear}
                    </option>
                  ))}
                </select>
              </label>

              {scheduleForm.classId && (() => {
                const sel = classes.find((c) => c._id === scheduleForm.classId);
                const secs = sel ? classes.filter((c) => c.name === sel.name && c.academicYear === sel.academicYear) : [];
                return secs.length > 1 ? (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", alignSelf: "flex-end", paddingBottom: 6 }}>
                    Other sections: <b>{secs.filter((s) => s._id !== scheduleForm.classId).map((s) => s.section).join(", ")}</b>
                  </div>
                ) : null;
              })()}

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Term
                <select className={inputClass} style={{ minWidth: 180 }} value={scheduleForm.termId} onChange={(e) => setScheduleForm({ ...scheduleForm, termId: e.target.value })}>
                  <option value="">Select term</option>
                  {terms.map((t) => <option key={t._id} value={t._id}>{t.name} – {t.academicYear}</option>)}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Exam Type
                <select className={inputClass} value={scheduleForm.examTypeId} onChange={(e) => setScheduleForm({ ...scheduleForm, examTypeId: e.target.value })}>
                  <option value="">Auto from term</option>
                  {types.map((t) => <option key={t._id} value={t._id}>{t.key} – {t.name}</option>)}
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Academic Year
                <input className={inputClass} style={{ width: 110 }} value={scheduleForm.academicYear} onChange={(e) => setScheduleForm({ ...scheduleForm, academicYear: e.target.value })} />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Status
                <select className={inputClass} value={scheduleForm.status} onChange={(e) => setScheduleForm({ ...scheduleForm, status: e.target.value as "draft" | "published" })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <button type="button" className="btn-ghost" onClick={() => loadClassSubjects(scheduleForm.classId, scheduleForm.examTypeId)} disabled={!scheduleForm.classId}>
                Auto-load Subjects
              </button>
              <button type="button" className="btn-dark" onClick={saveSchedule}>
                {editingScheduleId ? "Update Schedule" : "Create Schedule"}
              </button>
              {editingScheduleId && <button type="button" className="btn-ghost" onClick={resetScheduleForm}>Cancel</button>}
            </div>

            {scheduleForm.rows.length ? (
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Exam Date</th>
                      <th>Start Time</th>
                      <th>End Time</th>
                      <th className="right">Total Marks</th>
                      <th className="right">Pass Marks</th>
                      <th>Room</th>
                      <th>Invigilator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleForm.rows.map((r, idx) => (
                      <tr key={`${r.subjectId}-${idx}`}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{subjects.find((s) => s._id === r.subjectId)?.name || r.subjectId}</div>
                          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{subjects.find((s) => s._id === r.subjectId)?.code || ""}</div>
                        </td>
                        <td>
                          <input type="date" className={inputClass} style={{ padding: "5px 8px" }} value={r.examDate} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, examDate: e.target.value }; setScheduleForm({ ...scheduleForm, rows }); }} />
                        </td>
                        <td>
                          <input type="time" className={inputClass} style={{ padding: "5px 8px" }} value={r.startTime} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, startTime: e.target.value }; setScheduleForm({ ...scheduleForm, rows }); }} />
                        </td>
                        <td>
                          <input type="time" className={inputClass} style={{ padding: "5px 8px" }} value={r.endTime} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, endTime: e.target.value }; setScheduleForm({ ...scheduleForm, rows }); }} />
                        </td>
                        <td>
                          <input type="number" className={inputClass} style={{ padding: "5px 8px", width: 70 }} value={r.totalMarks} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, totalMarks: Number(e.target.value) }; setScheduleForm({ ...scheduleForm, rows }); }} />
                        </td>
                        <td>
                          <input type="number" className={inputClass} style={{ padding: "5px 8px", width: 70 }} value={r.passingMarks} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, passingMarks: Number(e.target.value) }; setScheduleForm({ ...scheduleForm, rows }); }} />
                        </td>
                        <td>
                          <input className={inputClass} style={{ padding: "5px 8px", width: 80 }} value={r.room} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, room: e.target.value }; setScheduleForm({ ...scheduleForm, rows }); }} />
                        </td>
                        <td>
                          <select className={inputClass} style={{ padding: "5px 8px" }} value={r.invigilatorId} onChange={(e) => { const rows = [...scheduleForm.rows]; rows[idx] = { ...r, invigilatorId: e.target.value }; setScheduleForm({ ...scheduleForm, rows }); }}>
                            <option value="">None</option>
                            {teachers.map((t) => <option key={t._id} value={t._id}>{t.firstName} {t.lastName}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="Select a class and click Auto-load Subjects to build the exam timetable." />
            )}
          </Panel> : null}

          <Panel title={userRole === "teacher" ? "Published Exam Schedule" : "Schedule Register"} meta={`${schedules.length} SCHEDULES`}>
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
                      <th className="right">Subjects</th>
                      {userRole === "teacher" ? <th>Exam Details</th> : null}
                      <th className="right">Status</th>
                      {userRole === "admin" ? <th className="right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => {
                      const cls = typeof s.classId === "object" ? s.classId : null;
                      const trm = typeof s.termId === "object" ? s.termId : null;
                      return (
                        <tr key={s._id}>
                          <td style={{ fontWeight: 600 }}>{cls ? `${cls.name}-${cls.section}` : String(s.classId)}</td>
                          <td>{trm ? trm.name : String(s.termId)}</td>
                          <td className="num">{s.academicYear}</td>
                          <td className="num">{s.rows?.length || 0}</td>
                          {userRole === "teacher" ? (
                            <td>
                              {s.rows.map((row, index) => {
                                const subject = typeof row.subjectId === "object" ? row.subjectId : null;
                                const examDate = row.examDate ? new Date(row.examDate).toISOString().slice(0, 10) : "";
                                const examType = typeof s.examTypeId === "object" && s.examTypeId ? s.examTypeId.key : "final";
                                return (
                                  <div key={`${s._id}-${index}`} style={{ marginBottom: 6 }}>
                                    <div>{subject?.name || String(row.subjectId)} · {examDate ? prettyDate(examDate) : "Date pending"}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                      {row.startTime || "—"}{row.endTime ? `–${row.endTime}` : ""} · {row.totalMarks} marks{row.room ? ` · ${row.room}` : ""}
                                    </div>
                                    {row.status === "published" && subject && (
                                      <Link
                                        className="link-btn"
                                        href={`/exams?tab=marksheet&classId=${encodeURIComponent(cls?._id || String(s.classId))}&scheduleId=${encodeURIComponent(s._id)}&subjectId=${encodeURIComponent(subject._id)}${examDate ? `&date=${encodeURIComponent(examDate)}` : ""}&term=${encodeURIComponent(trm?.name || "")}&examType=${encodeURIComponent(examType.toLowerCase())}`}
                                      >Enter Marks</Link>
                                    )}
                                  </div>
                                );
                              })}
                            </td>
                          ) : null}
                          <td className="right"><StatusBadge status={s.status} /></td>
                          {userRole === "admin" ? <td>
                            <div className="row-actions">
                              <button type="button" className="link-btn" onClick={() => editSchedule(s)}>Edit</button>
                              <button type="button" className="link-btn danger" onClick={() => removeSchedule(s._id)}>Delete</button>
                            </div>
                          </td> : null}
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

      {/* ── RESULTS REGISTER TAB ───────────────────────────────── */}
      {tab === "results" ? (
        <>
          {!exams.length ? <EmptyState message="No exams yet. Use the Mark Sheet tab or Quick Exam button." /> : null}
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
                      {userRole === "admin" ? (
                        <>
                          <button type="button" className="link-btn" onClick={(ev) => { ev.stopPropagation(); setEditing(exam); setOpen(true); }}>Edit</button>
                          <button type="button" className="link-btn danger" onClick={(ev) => { ev.stopPropagation(); remove(exam._id); }}>Delete</button>
                        </>
                      ) : null}
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
                        <td><NameCell name={student ? fullName(student) : "Unknown"} sub={student?.admissionNo} /></td>
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
                    <tr><td colSpan={10} style={{ color: "var(--text-dim)", padding: "22px 0" }}>No results for this exam. Use the Mark Sheet tab to enter marks.</td></tr>
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
