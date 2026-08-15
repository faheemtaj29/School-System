"use client";

import { FormEvent, useEffect, useState } from "react";
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
            <div className="pick-list">
              {subjects.map((s) => (
                <label key={s._id} className={`pick${form.subjects.includes(s._id) ? " on" : ""}`}>
                  <input
                    type="checkbox"
                    checked={form.subjects.includes(s._id)}
                    onChange={() => toggleSubject(s._id)}
                  />
                  {s.name}
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
  const [form, setForm] = useState({
    title: "",
    examType: "midterm",
    classId: "",
    subjectId: "",
    teacherId: "",
    date: "",
    maxMarks: 100,
    results: [] as { studentId: string; marks: number; grade: string; remarks: string }[],
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        title: initial.title,
        examType: initial.examType,
        classId: idOf(initial.classId),
        subjectId: idOf(initial.subjectId),
        teacherId: idOf(initial.teacherId as never),
        date: toDateInput(initial.date),
        maxMarks: initial.maxMarks,
        results: (initial.results || []).map((r) => ({
          studentId: idOf(r.studentId),
          marks: r.marks,
          grade: r.grade ?? "",
          remarks: r.remarks ?? "",
        })),
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
          .map(
            (s) => map.get(s._id) ?? { studentId: s._id, marks: 0, grade: "", remarks: "" }
          ),
      };
    });
  }, [form.classId, students]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(initial ? `/api/exams/${initial._id}` : "/api/exams", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
          <div className="form-section-title">Result Sheet</div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            <table className="reg">
              <thead>
                <tr>
                  <th>Student</th>
                  <th style={{ width: 90 }}>Marks</th>
                  <th style={{ width: 90 }}>Grade</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {form.results.map((r, idx) => {
                  const student = classStudents.find((s) => s._id === r.studentId);
                  return (
                    <tr key={r.studentId}>
                      <td>{student ? `${student.firstName} ${student.lastName}` : r.studentId}</td>
                      <td>
                        <input
                          type="number"
                          className={inputClass}
                          style={{ padding: "7px 9px" }}
                          value={r.marks}
                          onChange={(e) => {
                            const results = [...form.results];
                            results[idx] = { ...r, marks: Number(e.target.value) };
                            setForm({ ...form, results });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          style={{ padding: "7px 9px" }}
                          placeholder="A+"
                          value={r.grade}
                          onChange={(e) => {
                            const results = [...form.results];
                            results[idx] = { ...r, grade: e.target.value };
                            setForm({ ...form, results });
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          style={{ padding: "7px 9px" }}
                          value={r.remarks}
                          onChange={(e) => {
                            const results = [...form.results];
                            results[idx] = { ...r, remarks: e.target.value };
                            setForm({ ...form, results });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!form.results.length ? (
                  <tr>
                    <td colSpan={4} style={{ color: "var(--text-dim)" }}>
                      No students enrolled in this class yet.
                    </td>
                  </tr>
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
  const [form, setForm] = useState({
    studentId: "",
    title: "",
    amount: 0,
    dueDate: "",
    status: "pending",
    paidAmount: 0,
    paymentDate: "",
    method: "",
    notes: "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        studentId: idOf(initial.studentId),
        title: initial.title,
        amount: initial.amount,
        dueDate: toDateInput(initial.dueDate),
        status: initial.status,
        paidAmount: initial.paidAmount,
        paymentDate: toDateInput(initial.paymentDate),
        method: initial.method ?? "",
        notes: initial.notes ?? "",
      });
    } else {
      setForm({
        studentId: "",
        title: "",
        amount: 0,
        dueDate: "",
        status: "pending",
        paidAmount: 0,
        paymentDate: "",
        method: "",
        notes: "",
      });
    }
    setError("");
  }, [open, initial]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(initial ? `/api/fees/${initial._id}` : "/api/fees", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
      subtitle="Challan linked to a student record"
      submitLabel={initial ? "Save Changes" : "Create Voucher"}
    >
      {error ? <div className="alert err">{error}</div> : null}
      <div className="form-grid one">
        <Field label="Student" required>
          <select className={inputClass} value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s._id} value={s._id}>
                {s.firstName} {s.lastName} — {s.admissionNo}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Voucher Title" required>
          <OptionSelect
            listKey="feeHeads"
            value={form.title}
            onChange={(title) => setForm({ ...form, title })}
            placeholder="Select fee head"
            addLabel="Add fee head"
            required
          />
        </Field>
      </div>
      <div className="form-grid" style={{ marginTop: 16 }}>
        <Field label="Amount" required>
          <input type="number" className={inputClass} value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required />
        </Field>
        <Field label="Paid Amount">
          <input type="number" className={inputClass} value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: Number(e.target.value) })} />
        </Field>
        <Field label="Due Date" required>
          <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
        </Field>
        <Field label="Payment Date">
          <input type="date" className={inputClass} value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </Field>
        <Field label="Payment Method">
          <select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="">Select</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank">Bank</option>
            <option value="online">Online</option>
          </select>
        </Field>
      </div>
      <div style={{ marginTop: 16 }}>
        <Field label="Notes">
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </ModalForm>
  );
}
