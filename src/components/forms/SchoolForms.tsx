"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSchoolProfile } from "@/lib/useSchoolProfile";
import { Field, ModalForm, OptionSelect, inputClass } from "@/components/ui";
import {
  ClassItem,
  ExamItem,
  FeeItem,
  STAGE_LABEL,
  STAGE_ORDER,
  StudentItem,
  SubjectItem,
  TeacherItem,
  idOf,
  toDateInput,
} from "@/lib/types";

export function ClassForm({
  open,
  onClose,
  onSaved,
  initial,
  teachers,
  subjects = [],
  defaultYear,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ClassItem | null;
  teachers: TeacherItem[];
  subjects?: SubjectItem[];
  defaultYear?: string;
}) {
  const empty = {
    name: "",
    section: "",
    academicYear: defaultYear || new Date().getFullYear().toString(),
    room: "",
    classTeacher: "",
    capacity: 40,
    stage: "",
    stream: "",
    subjects: [] as string[],
  };
  const [form, setForm] = useState(empty);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        name: initial.name,
        section: initial.section,
        academicYear: initial.academicYear,
        room: initial.room ?? "",
        classTeacher: initial.classTeacher?._id ?? "",
        capacity: initial.capacity,
        stage: initial.stage ?? "",
        stream: initial.stream ?? "",
        subjects: (initial.subjects ?? []).map((s) => s._id),
      });
    } else {
      setForm(empty);
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function toggleSubject(id: string) {
    setForm((f) => ({
      ...f,
      subjects: f.subjects.includes(id)
        ? f.subjects.filter((s) => s !== id)
        : [...f.subjects, id],
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(initial ? `/api/classes/${initial._id}` : "/api/classes", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save class");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      title={initial ? "Edit Class / Section" : "Add New Class / Section"}
      subtitle="Assign a room, capacity and class teacher"
      submitLabel={initial ? "Save Changes" : "Create Class"}
      wide
    >
      {error ? <div className="alert err">{error}</div> : null}
      <div className="form-grid">
        <Field label="Grade / Class" required>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 8" required />
        </Field>
        <Field label="Section" required>
          <input className={inputClass} value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="e.g. B" required />
        </Field>
        <Field label="Academic Year" required>
          <input className={inputClass} value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} placeholder="e.g. 2026" required />
        </Field>
        <Field label="Room No.">
          <input className={inputClass} value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Block C · 201" />
        </Field>
        <Field label="Max Capacity">
          <input type="number" className={inputClass} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
        </Field>
        <Field label="Class Teacher">
          <select className={inputClass} value={form.classTeacher} onChange={(e) => setForm({ ...form, classTeacher: e.target.value })}>
            <option value="">None</option>
            {teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select className={inputClass} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
            <option value="">Not set</option>
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group / Programme">
          <input className={inputClass} value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })} placeholder="e.g. Pre-Medical" />
        </Field>
      </div>

      {subjects.length ? (
        <div style={{ marginTop: 16 }}>
          <Field label={`Subjects (${form.subjects.length} selected)`}>
            <div className="pick-tools">
              <input
                className={inputClass}
                placeholder="Search subjects…"
                value={subjectSearch}
                onChange={(e) => setSubjectSearch(e.target.value)}
              />
              <label className="check-row">
                <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
                Show selected only
              </label>
            </div>
            <div className="pick-list">
              {subjects
                .filter((s) => !onlyPicked || form.subjects.includes(s._id))
                .filter((s) => !subjectSearch || `${s.name} ${s.code}`.toLowerCase().includes(subjectSearch.toLowerCase()))
                // Ticked subjects first, so the class's own list is visible without scrolling.
                .sort((a, b) => Number(form.subjects.includes(b._id)) - Number(form.subjects.includes(a._id)) || a.name.localeCompare(b.name))
                .map((s) => (
                  <label key={s._id} className={`pick${form.subjects.includes(s._id) ? " on" : ""}`} title={`${s.name} (${s.code})`}>
                    <input
                      type="checkbox"
                      checked={form.subjects.includes(s._id)}
                      onChange={() => toggleSubject(s._id)}
                    />
                    <b>{s.name}</b>
                    <span>{s.code}</span>
                  </label>
                ))}
            </div>
          </Field>
        </div>
      ) : null}
    </ModalForm>
  );
}

export function SubjectForm({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: SubjectItem | null;
}) {
  const [form, setForm] = useState({ name: "", code: "", description: "", credits: 1 });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(
      initial
        ? {
            name: initial.name,
            code: initial.code,
            description: initial.description ?? "",
            credits: initial.credits,
          }
        : { name: "", code: "", description: "", credits: 1 }
    );
    setError("");
  }, [open, initial]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(initial ? `/api/subjects/${initial._id}` : "/api/subjects", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save subject");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      title={initial ? "Edit Subject" : "Add New Subject"}
      submitLabel={initial ? "Save Changes" : "Add Subject"}
    >
      {error ? <div className="alert err">{error}</div> : null}
      <div className="form-grid">
        <Field label="Subject Name" required>
          <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Computer Science" required />
        </Field>
        <Field label="Subject Code" required>
          <input className={inputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. CS-08" required />
        </Field>
        <Field label="Weekly Periods / Credits">
          <input type="number" className={inputClass} value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} />
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="Description">
          <textarea className={inputClass} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </ModalForm>
  );
}

export function ExamForm({
  open,
  onClose,
  onSaved,
  initial,
  classes,
  subjects,
  teachers,
  students,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: ExamItem | null;
  classes: ClassItem[];
  subjects: SubjectItem[];
  teachers: TeacherItem[];
  students: StudentItem[];
}) {
  type CompKey = "theory" | "viva" | "assignment" | "attendance" | "project";
  const COMP_KEYS: CompKey[] = ["theory", "viva", "assignment", "attendance", "project"];
  const COMP_LABEL: Record<CompKey, string> = { theory: "Theory", viva: "Viva", assignment: "Asn", attendance: "Att", project: "Proj" };

  const [form, setForm] = useState({
    title: "",
    examType: "midterm",
    classId: "",
    subjectId: "",
    teacherId: "",
    date: "",
    maxMarks: 100,
    useComponents: false,
    markComponents: { theory: 60, viva: 10, assignment: 10, attendance: 10, project: 10 } as Record<CompKey, number>,
    results: [] as { studentId: string; marks: number; components: Record<CompKey, number>; grade: string; remarks: string }[],
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const raw = initial as { markComponents?: Record<string, number> };
      const mc = raw.markComponents || { theory: 60, viva: 10, assignment: 10, attendance: 10, project: 10 };
      const hasComp = Boolean(raw.markComponents);
      setForm({
        title: initial.title,
        examType: initial.examType,
        classId: idOf(initial.classId),
        subjectId: idOf(initial.subjectId),
        teacherId: idOf(initial.teacherId as never),
        date: toDateInput(initial.date),
        maxMarks: initial.maxMarks,
        useComponents: hasComp,
        markComponents: mc as Record<"theory" | "viva" | "assignment" | "attendance" | "project", number>,
        results: (initial.results || []).map((r) => {
          const rComp = (r as { components?: Record<string, number> }).components;
          return { studentId: idOf(r.studentId), marks: r.marks, components: (rComp || { theory: 0, viva: 0, assignment: 0, attendance: 0, project: 0 }) as Record<"theory" | "viva" | "assignment" | "attendance" | "project", number>, grade: r.grade ?? "", remarks: r.remarks ?? "" };
        }),
      });
    } else {
      setForm({
        title: "",
        examType: "midterm",
        classId: "",
        subjectId: "",
        teacherId: "",
        date: "",
        maxMarks: 100,
        useComponents: false,
        markComponents: { theory: 60, viva: 10, assignment: 10, attendance: 10, project: 10 },
        results: [],
      });
    }
    setError("");
  }, [open, initial]);

  const classStudents = students.filter((s) => idOf(s.classId) === form.classId);

  useEffect(() => {
    if (!form.classId) return;
    setForm((prev) => {
      const map = new Map(prev.results.map((r) => [r.studentId, r]));
      return {
        ...prev,
        results: students
          .filter((s) => idOf(s.classId) === prev.classId)
          .map((s) => map.get(s._id) ?? { studentId: s._id, marks: 0, components: { theory: 0, viva: 0, assignment: 0, attendance: 0, project: 0 }, grade: "", remarks: "" }),
      };
    });
  }, [form.classId, students]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      markComponents: form.useComponents ? form.markComponents : undefined,
      results: form.results.map((r) => ({
        ...r,
        marks: form.useComponents
          ? Object.values(r.components).reduce((a, b) => a + b, 0)
          : r.marks,
        components: form.useComponents ? r.components : undefined,
      })),
    };
    const res = await fetch(initial ? `/api/exams/${initial._id}` : "/api/exams", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save exam");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      title={initial ? "Edit Exam" : "Schedule Exam"}
      subtitle="Exam details and student result sheet"
      wide
      submitLabel={initial ? "Save Changes" : "Create Exam"}
    >
      {error ? <div className="alert err">{error}</div> : null}

      <div className="form-section-title">Exam Details</div>
      <div className="form-grid">
        <Field label="Title" required>
          <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mid-Term Mathematics" required />
        </Field>
        <Field label="Type" required>
          <select className={inputClass} value={form.examType} onChange={(e) => setForm({ ...form, examType: e.target.value })}>
            <option value="quiz">Quiz</option>
            <option value="midterm">Midterm</option>
            <option value="final">Final</option>
            <option value="assignment">Assignment</option>
          </select>
        </Field>
        <Field label="Class" required>
          <select className={inputClass} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} required>
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} - {c.section}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject" required>
          <select className={inputClass} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} required>
            <option value="">Select subject</option>
            {subjects.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Teacher">
          <select className={inputClass} value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
            <option value="">Optional</option>
            {teachers.map((t) => (
              <option key={t._id} value={t._id}>
                {t.firstName} {t.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" required>
          <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        </Field>
        <Field label="Total Marks" required>
          <input type="number" className={inputClass} value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })} required />
        </Field>
      </div>

      {form.classId ? (
        <>
          <div className="form-section-title" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            Result Sheet
            <label style={{ fontSize: 12, fontWeight: 400, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={form.useComponents} onChange={(e) => setForm({ ...form, useComponents: e.target.checked })} />
              Use component marks (Theory / Viva / Assignment / Attendance / Project)
            </label>
          </div>

          {form.useComponents && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10, background: "var(--bg-soft,#f8f8f8)", padding: 10, borderRadius: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, alignSelf: "center" }}>Max Marks:</span>
              {COMP_KEYS.map((k) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                  {COMP_LABEL[k]}
                  <input type="number" style={{ width: 52, padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 5 }} value={form.markComponents[k]} min={0} onChange={(e) => setForm({ ...form, markComponents: { ...form.markComponents, [k]: Number(e.target.value) }, maxMarks: Object.values({ ...form.markComponents, [k]: Number(e.target.value) }).reduce((a, b) => a + b, 0) })} />
                </label>
              ))}
              <span style={{ fontSize: 12, fontWeight: 700, alignSelf: "center" }}>Total: {form.maxMarks}</span>
            </div>
          )}

          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            <table className="reg" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Student</th>
                  {form.useComponents ? COMP_KEYS.map((k) => <th key={k} style={{ width: 60 }}>{COMP_LABEL[k]}</th>) : <th style={{ width: 90 }}>Marks</th>}
                  {form.useComponents && <th style={{ width: 60 }}>Total</th>}
                  <th style={{ width: 70 }}>Grade</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {form.results.map((r, idx) => {
                  const student = classStudents.find((s) => s._id === r.studentId);
                  const compTotal = Object.values(r.components).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={r.studentId}>
                      <td>{student ? `${student.firstName} ${student.lastName}` : r.studentId}</td>
                      {form.useComponents ? COMP_KEYS.map((k) => (
                        <td key={k}>
                          <input type="number" style={{ width: 50, padding: "4px 5px", border: "1px solid var(--border)", borderRadius: 5, fontSize: 11 }} value={r.components[k]} min={0} max={form.markComponents[k]} onChange={(e) => { const results = [...form.results]; results[idx] = { ...r, components: { ...r.components, [k]: Number(e.target.value) } }; setForm({ ...form, results }); }} />
                        </td>
                      )) : (
                        <td>
                          <input type="number" className={inputClass} style={{ padding: "7px 9px" }} value={r.marks} onChange={(e) => { const results = [...form.results]; results[idx] = { ...r, marks: Number(e.target.value) }; setForm({ ...form, results }); }} />
                        </td>
                      )}
                      {form.useComponents && <td style={{ fontWeight: 700, textAlign: "right" }}>{compTotal}</td>}
                      <td>
                        <input className={inputClass} style={{ padding: "7px 9px" }} placeholder="A+" value={r.grade} onChange={(e) => { const results = [...form.results]; results[idx] = { ...r, grade: e.target.value }; setForm({ ...form, results }); }} />
                      </td>
                      <td>
                        <input className={inputClass} style={{ padding: "7px 9px" }} value={r.remarks} onChange={(e) => { const results = [...form.results]; results[idx] = { ...r, remarks: e.target.value }; setForm({ ...form, results }); }} />
                      </td>
                    </tr>
                  );
                })}
                {!form.results.length ? (
                  <tr><td colSpan={8} style={{ color: "var(--text-dim)" }}>No students enrolled in this class yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </ModalForm>
  );
}

export function FeeForm({
  open,
  onClose,
  onSaved,
  initial,
  students,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: FeeItem | null;
  students: StudentItem[];
}) {
  const { currency: cur } = useSchoolProfile();
  const [form, setForm] = useState({
    studentId: "",
    dueDate: "",
    status: "pending",
    paidAmount: 0,
    paymentDate: "",
    method: "",
    notes: "",
    installments: 1,
  });
  const [lines, setLines] = useState<{ head: string; amount: number }[]>([
    { head: "Tuition Fee", amount: 0 },
  ]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        studentId: idOf(initial.studentId),
        dueDate: toDateInput(initial.dueDate),
        status: initial.status,
        paidAmount: initial.paidAmount,
        paymentDate: toDateInput(initial.paymentDate),
        method: initial.method ?? "",
        notes: initial.notes ?? "",
        installments: 1,
      });
      setLines(
        initial.lines?.length
          ? initial.lines.map((l) => ({ head: l.head, amount: l.amount }))
          : [{ head: initial.title, amount: initial.originalAmount ?? initial.amount }]
      );
    } else {
      setForm({
        studentId: "",
        dueDate: toDateInput(new Date()),
        status: "pending",
        paidAmount: 0,
        paymentDate: "",
        method: "",
        notes: "",
        installments: 1,
      });
      setLines([{ head: "Tuition Fee", amount: 0 }]);
    }
    setError("");
  }, [open, initial]);

  const gross = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  function setLine(index: number, patch: Partial<{ head: string; amount: number }>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { head: "", amount: 0 }]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!initial && form.installments > 1) {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "installments",
          studentId: form.studentId,
          firstDueDate: form.dueDate,
          installments: form.installments,
          lines: lines.filter((l) => l.head.trim()),
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create installments");
        return;
      }
      onSaved();
      onClose();
      return;
    }
    const payload = {
      ...form,
      method: form.method || undefined,
      lines: lines.filter((l) => l.head.trim()),
    };
    delete (payload as { installments?: number }).installments;
    const res = await fetch(initial ? `/api/fees/${initial._id}` : "/api/fees", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save fee");
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      title={initial ? "Edit Voucher" : "Generate Fee Voucher"}
      subtitle="Add each fee head on its own line — total is calculated automatically"
      submitLabel={initial ? "Save Changes" : "Create Voucher"}
      wide
    >
      {error ? <div className="alert err">{error}</div> : null}
      <div className="form-grid">
        <Field label="Student" required>
          <select
            className={inputClass}
            value={form.studentId}
            onChange={(e) => setForm({ ...form, studentId: e.target.value })}
            required
          >
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s._id} value={s._id}>
                {s.firstName} {s.lastName} — {s.admissionNo}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due Date" required>
          <input
            type="date"
            className={inputClass}
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            required
          />
        </Field>
        {!initial ? (
          <Field label="Installments">
            <input
              type="number"
              min={1}
              max={12}
              className={inputClass}
              value={form.installments}
              onChange={(e) => setForm({ ...form, installments: Number(e.target.value) || 1 })}
            />
          </Field>
        ) : null}
      </div>

      <div className="form-section-title" style={{ marginTop: 18 }}>
        Fee heads
      </div>
      <div className="voucher-line-head fee-line-head">
        <span>Fee head</span>
        <span>Amount</span>
        <span />
      </div>
      {lines.map((line, index) => (
        <div className="voucher-line-row fee-line-row" key={index}>
          <OptionSelect
            listKey="feeHeads"
            value={line.head}
            onChange={(head) => setLine(index, { head })}
            placeholder="Select or add fee head"
            addLabel="Add fee head"
            required
          />
          <input
            type="number"
            min={0}
            className={inputClass}
            value={line.amount}
            onChange={(e) => setLine(index, { amount: Number(e.target.value) })}
            required
          />
          <button
            type="button"
            className="link-btn danger"
            onClick={() => removeLine(index)}
            disabled={lines.length <= 1}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="form-actions" style={{ marginTop: 10, marginBottom: 4 }}>
        <button type="button" className="btn-ghost" onClick={addLine}>
          + Add another line
        </button>
        <div className="voucher-balance">Gross total · {cur} {gross.toLocaleString()}</div>
      </div>

      {initial ? (
        <div className="alert ok" style={{ marginTop: 16 }}>
          Paid so far: {cur} {(initial.paidAmount || 0).toLocaleString()} · status {initial.status}. Record money received with
          the <b>Collect</b> button on the fee list — it prints the receipt and posts to the cash book.
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <Field label="Notes">
          <textarea
            className={inputClass}
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </div>
    </ModalForm>
  );
}
