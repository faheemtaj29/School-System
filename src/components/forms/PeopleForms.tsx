"use client";

import { FormEvent, useEffect, useState } from "react";
import { Field, ModalForm, inputClass } from "@/components/ui";
import {
  ClassItem,
  StudentItem,
  SubjectItem,
  TeacherItem,
  idOf,
  toDateInput,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: StudentItem | null;
  classes: ClassItem[];
};

const empty = {
  admissionNo: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  address: "",
  classId: "",
  rollNumber: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  admissionDate: "",
  status: "active",
  branchCode: "",
};

/** Campus list shared by both people forms. */
function useBranches() {
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setBranches(d.settings?.branches || []))
      .catch(() => undefined);
  }, []);
  return branches;
}

export function StudentForm({ open, onClose, onSaved, initial, classes }: Props) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const branches = useBranches();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        admissionNo: initial.admissionNo,
        firstName: initial.firstName,
        lastName: initial.lastName,
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        gender: initial.gender ?? "",
        dateOfBirth: toDateInput(initial.dateOfBirth),
        address: initial.address ?? "",
        classId: idOf(initial.classId),
        rollNumber: initial.rollNumber ?? "",
        parentName: initial.parentName ?? "",
        parentPhone: initial.parentPhone ?? "",
        parentEmail: initial.parentEmail ?? "",
        admissionDate: toDateInput(initial.admissionDate),
        status: initial.status,
        branchCode: initial.branchCode ?? "",
      });
    } else {
      setForm(empty);
    }
    setError("");
  }, [open, initial]);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(initial ? `/api/students/${initial._id}` : "/api/students", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save student");
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
      title={initial ? "Edit Student" : "New Admission Form"}
      subtitle="Personal, academic and guardian details"
      wide
      submitLabel={initial ? "Update Student" : "Enroll Student"}
    >
      {error ? <div className="alert err">{error}</div> : null}

      <div className="form-section-title">Personal Information</div>
      <div className="form-grid">
        <Field label="First Name" required>
          <input className={inputClass} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="e.g. Ahmed" required />
        </Field>
        <Field label="Last Name" required>
          <input className={inputClass} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="e.g. Raza" required />
        </Field>
        <Field label="Gender">
          <select className={inputClass} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date of Birth">
          <input type="date" className={inputClass} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03XX-XXXXXXX" />
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Address">
          <input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
      </div>

      <div className="form-section-title">Academic Details</div>
      <div className="form-grid">
        <Field label="Admission No." required>
          <input className={inputClass} value={form.admissionNo} onChange={(e) => set("admissionNo", e.target.value)} placeholder="e.g. ADM-0441" required />
        </Field>
        <Field label="Roll Number">
          <input className={inputClass} value={form.rollNumber} onChange={(e) => set("rollNumber", e.target.value)} placeholder="e.g. 081" />
        </Field>
        <Field label="Class" required>
          <select className={inputClass} value={form.classId} onChange={(e) => set("classId", e.target.value)} required>
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} - {c.section} ({c.academicYear})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Admission Date">
          <input type="date" className={inputClass} value={form.admissionDate} onChange={(e) => set("admissionDate", e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="graduated">Graduated</option>
          </select>
        </Field>
        <Field label="Campus / Branch">
          <select className={inputClass} value={form.branchCode} onChange={(e) => set("branchCode", e.target.value)}>
            <option value="">Not assigned</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="form-section-title">Guardian Contact</div>
      <div className="form-grid">
        <Field label="Guardian / Father's Name">
          <input className={inputClass} value={form.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="e.g. Muhammad Raza" />
        </Field>
        <Field label="Guardian Contact">
          <input className={inputClass} value={form.parentPhone} onChange={(e) => set("parentPhone", e.target.value)} placeholder="03XX-XXXXXXX" />
        </Field>
        <Field label="Guardian Email">
          <input type="email" className={inputClass} value={form.parentEmail} onChange={(e) => set("parentEmail", e.target.value)} />
        </Field>
      </div>
    </ModalForm>
  );
}

type TeacherProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: TeacherItem | null;
  subjects: SubjectItem[];
  classes: ClassItem[];
};

const teacherEmpty = {
  employeeId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  joinDate: "",
  address: "",
  subjects: [] as string[],
  classes: [] as string[],
  qualification: "",
  status: "active",
  branchCode: "",
};

export function TeacherForm({
  open,
  onClose,
  onSaved,
  initial,
  subjects,
  classes,
}: TeacherProps) {
  const [form, setForm] = useState(teacherEmpty);
  const [error, setError] = useState("");
  const branches = useBranches();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        employeeId: initial.employeeId,
        firstName: initial.firstName,
        lastName: initial.lastName,
        email: initial.email,
        phone: initial.phone ?? "",
        gender: initial.gender ?? "",
        dateOfBirth: toDateInput(initial.dateOfBirth),
        joinDate: toDateInput(initial.joinDate),
        address: initial.address ?? "",
        subjects: (initial.subjects || []).map((s) => idOf(s as never)),
        classes: (initial.classes || []).map((c) => idOf(c as never)),
        qualification: initial.qualification ?? "",
        status: initial.status,
        branchCode: initial.branchCode ?? "",
      });
    } else {
      setForm(teacherEmpty);
    }
    setError("");
  }, [open, initial]);

  function toggleMulti(key: "subjects" | "classes", id: string) {
    setForm((prev) => {
      const list = prev[key];
      return {
        ...prev,
        [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      };
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(initial ? `/api/teachers/${initial._id}` : "/api/teachers", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save teacher");
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
      title={initial ? "Edit Staff Member" : "Add Staff Member"}
      subtitle="Assign related subjects and classes"
      wide
      submitLabel={initial ? "Update Staff" : "Add Staff"}
    >
      {error ? <div className="alert err">{error}</div> : null}

      <div className="form-section-title">Staff Information</div>
      <div className="form-grid">
        <Field label="Employee ID" required>
          <input className={inputClass} value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} placeholder="e.g. EMP-1042" required />
        </Field>
        <Field label="Email" required>
          <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="First Name" required>
          <input className={inputClass} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
        </Field>
        <Field label="Last Name" required>
          <input className={inputClass} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
        </Field>
        <Field label="Contact Number">
          <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03XX-XXXXXXX" />
        </Field>
        <Field label="Qualification">
          <input className={inputClass} value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. M.Sc Mathematics" />
        </Field>
        <Field label="Join Date">
          <input type="date" className={inputClass} value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} />
        </Field>
        <Field label="Campus / Branch">
          <select className={inputClass} value={form.branchCode} onChange={(e) => setForm({ ...form, branchCode: e.target.value })}>
            <option value="">Not assigned</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>

      <div className="form-section-title">Subject &amp; Class Assignment</div>
      <div className="form-grid">
        <div className="field">
          <label>Subjects</label>
          <div className="check-list">
            {subjects.map((s) => (
              <label key={s._id}>
                <input
                  type="checkbox"
                  checked={form.subjects.includes(s._id)}
                  onChange={() => toggleMulti("subjects", s._id)}
                />
                {s.name} ({s.code})
              </label>
            ))}
            {!subjects.length ? (
              <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                Add subjects first
              </span>
            ) : null}
          </div>
        </div>
        <div className="field">
          <label>Classes</label>
          <div className="check-list">
            {classes.map((c) => (
              <label key={c._id}>
                <input
                  type="checkbox"
                  checked={form.classes.includes(c._id)}
                  onChange={() => toggleMulti("classes", c._id)}
                />
                {c.name} - {c.section}
              </label>
            ))}
            {!classes.length ? (
              <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                Add classes first
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </ModalForm>
  );
}
