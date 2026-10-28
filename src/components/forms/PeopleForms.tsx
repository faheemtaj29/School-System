"use client";

import { FormEvent, useEffect, useState } from "react";
import { PersonPhoto, savePickedPhoto } from "@/components/PersonPhoto";
import { Field, ModalForm, OptionSelect, inputClass } from "@/components/ui";
import {
  ClassItem,
  StudentItem,
  SubjectItem,
  TeacherItem,
  idOf,
  photoSrc,
  toDateInput,
} from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: StudentItem | null;
  classes: ClassItem[];
};

function formatCnic(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

const empty = {
  admissionNo: "",
  idMode: "auto",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  gender: "",
  dateOfBirth: "",
  address: "",
  cnic: "",
  nationality: "",
  religion: "",
  previousSchool: "",
  classId: "",
  rollNumber: "",
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  admissionDate: "",
  status: "active",
  branchCode: "",
  discountType: "none",
  discountPercent: "0",
  linkedTeacherId: "",
  custom: {} as Record<string, string>,
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

type FeeLine = { head: string; amount: string };

export function StudentForm({ open, onClose, onSaved, initial, classes }: Props) {
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [customDefs, setCustomDefs] = useState<
    { key: string; label: string; fieldType: string; options?: string[]; required?: boolean; helpText?: string }[]
  >([]);
  const branches = useBranches();
  // Admission fee lines (only for new admissions)
  const [feeLines, setFeeLines] = useState<FeeLine[]>([]);
  const [feeDue, setFeeDue] = useState("");
  // Photo picked before a new admission is saved; uploaded once the record exists.
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/teachers")
      .then((r) => r.json())
      .then((d) => setTeachers(d.teachers || []))
      .catch(() => undefined);
    fetch("/api/platform?view=fields&entity=student")
      .then((r) => r.json())
      .then((d) => setCustomDefs(d.fields || []))
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        admissionNo: initial.admissionNo,
        idMode: "manual",
        firstName: initial.firstName,
        lastName: initial.lastName,
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        gender: initial.gender ?? "",
        dateOfBirth: toDateInput(initial.dateOfBirth),
        address: initial.address ?? "",
        cnic: initial.cnic ?? "",
        nationality: initial.nationality ?? "",
        religion: initial.religion ?? "",
        previousSchool: initial.previousSchool ?? "",
        classId: idOf(initial.classId),
        rollNumber: initial.rollNumber ?? "",
        parentName: initial.parentName ?? "",
        parentPhone: initial.parentPhone ?? "",
        parentEmail: initial.parentEmail ?? "",
        admissionDate: toDateInput(initial.admissionDate),
        status: initial.status,
        branchCode: initial.branchCode ?? "",
        discountType: initial.discountType ?? "none",
        discountPercent: String(initial.discountPercent ?? 0),
        linkedTeacherId: idOf(initial.linkedTeacherId as never) || "",
        custom: (initial.custom as Record<string, string>) || {},
      });
    } else {
      setForm(empty);
      setFeeLines([]);
      setFeeDue("");
      fetch("/api/numbers?kind=student")
        .then((r) => r.json())
        .then((d) => {
          setForm((prev) => ({
            ...prev,
            admissionNo: d.next || "",
            idMode: d.modes?.studentIdMode === "manual" ? "manual" : "auto",
          }));
        })
        .catch(() => undefined);
    }
    setError("");
  }, [open, initial]);

  function set<K extends keyof typeof empty>(key: K, value: (typeof empty)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      ...form,
      admissionNo: form.idMode === "auto" && !initial ? "" : form.admissionNo,
      discountPercent: Number(form.discountPercent || 0),
      linkedTeacherId: form.linkedTeacherId || null,
    };
    delete (payload as { idMode?: string }).idMode;
    const res = await fetch(initial ? `/api/students/${initial._id}` : "/api/students", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save student");
      return;
    }
    // Generate admission fee voucher if fee lines were specified
    if (!initial && feeLines.length > 0 && feeDue) {
      const validLines = feeLines.filter((l) => l.head && Number(l.amount) > 0);
      if (validLines.length > 0) {
        const studentId = data.student?._id;
        if (studentId) {
          const total = validLines.reduce((s, l) => s + Number(l.amount), 0);
          await fetch("/api/fees", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "single",
              studentId,
              title: "Admission Fees",
              dueDate: feeDue,
              amount: total,
              lines: validLines.map((l) => ({ head: l.head, amount: Number(l.amount) })),
              branchCode: form.branchCode || "",
            }),
          });
        }
      }
    }
    if (!initial) await savePickedPhoto("student", data.student?._id, pickedPhoto);
    setPickedPhoto(null);
    setFeeLines([]);
    setFeeDue("");
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      title={initial ? "Edit Student" : "New Admission Form"}
      subtitle="Personal, academic, guardian and fee concession details"
      wide
      submitLabel={initial ? "Update Student" : "Enroll Student"}
    >
      {error ? <div className="alert err">{error}</div> : null}

      <div className="form-photo-row">
        <PersonPhoto
          kind="student"
          id={initial?._id}
          url={photoSrc("student", initial ?? { _id: "" })}
          name={`${form.firstName} ${form.lastName}`}
          size={84}
          editable
          onPicked={setPickedPhoto}
        />
        <div className="form-photo-note">
          <b>Student photo</b>
          <span>Shown on the profile, student list, ID card and result cards. A phone picture is fine — it is resized automatically.</span>
        </div>
      </div>

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
        <Field label="CNIC / B-Form No.">
          <input
            className={inputClass}
            value={form.cnic}
            onChange={(e) => set("cnic", formatCnic(e.target.value))}
            placeholder="12345-1234567-1"
            maxLength={15}
          />
        </Field>
        <Field label="Nationality">
          <input className={inputClass} value={form.nationality} onChange={(e) => set("nationality", e.target.value)} placeholder="e.g. Pakistani" />
        </Field>
        <Field label="Religion">
          <input className={inputClass} value={form.religion} onChange={(e) => set("religion", e.target.value)} placeholder="e.g. Islam" />
        </Field>
        <Field label="Previous School">
          <input className={inputClass} value={form.previousSchool} onChange={(e) => set("previousSchool", e.target.value)} placeholder="e.g. City Grammar School" />
        </Field>
      </div>

      <div className="form-section-title">Academic Details</div>
      <div className="form-grid">
        <Field label="Admission No." required>
          <div style={{ display: "grid", gap: 6 }}>
            {!initial ? (
              <div className="chips">
                <button
                  type="button"
                  className={`filter-chip${form.idMode === "auto" ? " active" : ""}`}
                  onClick={() => {
                    set("idMode", "auto");
                    fetch("/api/numbers?kind=student")
                      .then((r) => r.json())
                      .then((d) => set("admissionNo", d.next || ""));
                  }}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={`filter-chip${form.idMode === "manual" ? " active" : ""}`}
                  onClick={() => set("idMode", "manual")}
                >
                  Manual
                </button>
              </div>
            ) : null}
            <input
              className={inputClass}
              value={form.admissionNo}
              onChange={(e) => {
                set("admissionNo", e.target.value);
                if (!initial) set("idMode", "manual");
              }}
              placeholder="STD-MAIN-2026-00001"
              required={form.idMode === "manual" || Boolean(initial)}
              readOnly={!initial && form.idMode === "auto"}
            />
          </div>
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

      <div className="form-section-title">Fee Concession</div>
      <div className="form-grid">
        <Field label="Concession type">
          <select
            className={inputClass}
            value={form.discountType}
            onChange={(e) => {
              const type = e.target.value;
              const defaults: Record<string, string> = {
                none: "0",
                teacher_child: "50",
                staff_child: "40",
                sibling: "25",
                merit: "100",
                need_based: "30",
                custom: form.discountPercent || "0",
              };
              setForm((prev) => ({
                ...prev,
                discountType: type,
                discountPercent: defaults[type] ?? "0",
              }));
            }}
          >
            <option value="none">No discount</option>
            <option value="teacher_child">Teacher&apos;s son / daughter (50%)</option>
            <option value="staff_child">Staff child (40%)</option>
            <option value="sibling">Sibling concession (25%)</option>
            <option value="merit">Merit scholarship (100%)</option>
            <option value="need_based">Need-based (30%)</option>
            <option value="custom">Custom percent</option>
          </select>
        </Field>
        <Field label="Discount %">
          <input
            type="number"
            min="0"
            max="100"
            className={inputClass}
            value={form.discountPercent}
            onChange={(e) => set("discountPercent", e.target.value)}
            disabled={form.discountType === "none"}
          />
        </Field>
        {form.discountType === "teacher_child" || form.discountType === "staff_child" ? (
          <Field label="Linked teacher / employee">
            <select
              className={inputClass}
              value={form.linkedTeacherId}
              onChange={(e) => set("linkedTeacherId", e.target.value)}
            >
              <option value="">Select employee</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.firstName} {t.lastName} · {t.employeeId}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>

      {customDefs.length ? (
        <>
          <div className="form-section-title">Custom fields</div>
          <div className="form-grid">
            {customDefs.map((def) => (
              <Field key={def.key} label={def.label} required={def.required}>
                {def.fieldType === "select" ? (
                  <select
                    className={inputClass}
                    value={form.custom[def.key] || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        custom: { ...prev.custom, [def.key]: e.target.value },
                      }))
                    }
                    required={def.required}
                  >
                    <option value="">Select</option>
                    {(def.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : def.fieldType === "boolean" ? (
                  <select
                    className={inputClass}
                    value={form.custom[def.key] || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        custom: { ...prev.custom, [def.key]: e.target.value },
                      }))
                    }
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    type={def.fieldType === "number" ? "number" : def.fieldType === "date" ? "date" : "text"}
                    value={form.custom[def.key] || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        custom: { ...prev.custom, [def.key]: e.target.value },
                      }))
                    }
                    required={def.required}
                    placeholder={def.helpText || ""}
                  />
                )}
              </Field>
            ))}
          </div>
        </>
      ) : null}

      {/* Admission fee generation — new students only */}
      {!initial ? (
        <>
          <div className="form-section-title">Admission Fees (optional)</div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>
            Optionally generate a fee voucher for this student at the time of admission.
          </p>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <Field label="Due Date">
              <input
                type="date"
                className={inputClass}
                value={feeDue}
                onChange={(e) => setFeeDue(e.target.value)}
              />
            </Field>
          </div>
          {feeLines.map((line, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 140px 32px", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <OptionSelect
                listKey="feeHeads"
                value={line.head}
                onChange={(v) => setFeeLines((prev) => prev.map((l, j) => j === i ? { ...l, head: v } : l))}
                placeholder="Fee head…"
              />
              <input
                type="number"
                min={0}
                className={inputClass}
                placeholder="Amount"
                value={line.amount}
                onChange={(e) => setFeeLines((prev) => prev.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
              />
              <button
                type="button"
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger)", fontSize: 18, lineHeight: 1, padding: 0 }}
                onClick={() => setFeeLines((prev) => prev.filter((_, j) => j !== i))}
                title="Remove"
              >×</button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: 12, marginTop: 4 }}
            onClick={() => setFeeLines((prev) => [...prev, { head: "", amount: "" }])}
          >
            + Add fee head
          </button>
          {feeLines.length > 0 ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
              Total: PKR {feeLines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toLocaleString()}
              {!feeDue ? " · Set a due date above to generate the voucher" : ""}
            </div>
          ) : null}
        </>
      ) : null}
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
  idMode: "auto",
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
  fatherName: "",
  cnic: "",
  taxNumber: "",
  designation: "",
  department: "",
  experienceYears: "",
  maritalStatus: "",
  bloodGroup: "",
  city: "",
  emergencyName: "",
  emergencyPhone: "",
  basicSalary: "",
  allowances: "",
  bankName: "",
  bankAccount: "",
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
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        employeeId: initial.employeeId,
        idMode: "manual",
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
        fatherName: initial.fatherName != null ? String(initial.fatherName) : "",
        cnic: initial.cnic != null ? String(initial.cnic) : "",
        taxNumber: initial.taxNumber != null ? String(initial.taxNumber) : "",
        designation: initial.designation != null ? String(initial.designation) : "",
        department: initial.department != null ? String(initial.department) : "",
        experienceYears: initial.experienceYears != null ? String(initial.experienceYears) : "",
        maritalStatus: initial.maritalStatus != null ? String(initial.maritalStatus) : "",
        bloodGroup: initial.bloodGroup != null ? String(initial.bloodGroup) : "",
        city: initial.city != null ? String(initial.city) : "",
        emergencyName: initial.emergencyName != null ? String(initial.emergencyName) : "",
        emergencyPhone: initial.emergencyPhone != null ? String(initial.emergencyPhone) : "",
        basicSalary: initial.basicSalary != null ? String(initial.basicSalary) : "",
        allowances: initial.allowances != null ? String(initial.allowances) : "",
        bankName: initial.bankName != null ? String(initial.bankName) : "",
        bankAccount: initial.bankAccount != null ? String(initial.bankAccount) : "",
        status: initial.status,
        branchCode: initial.branchCode ?? "",
      });
    } else {
      setForm(teacherEmpty);
      fetch("/api/numbers?kind=teacher")
        .then((r) => r.json())
        .then((d) => {
          setForm((prev) => ({
            ...prev,
            employeeId: d.next || "",
            idMode: d.modes?.employeeIdMode === "manual" ? "manual" : "auto",
          }));
        })
        .catch(() => undefined);
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
    const { idMode, ...rest } = form;
    // Empty optional fields are left out so they don't fail number / choice checks.
    const cleaned = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => !(typeof v === "string" && v.trim() === ""))
    );
    const payload = {
      ...cleaned,
      subjects: form.subjects,
      classes: form.classes,
      employeeId: idMode === "auto" && !initial ? "" : form.employeeId,
    };
    const res = await fetch(initial ? `/api/teachers/${initial._id}` : "/api/teachers", {
      method: initial ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to save teacher");
      return;
    }
    if (!initial) await savePickedPhoto("teacher", data.teacher?._id, pickedPhoto);
    setPickedPhoto(null);
    onSaved();
    onClose();
  }

  return (
    <ModalForm
      open={open}
      onClose={onClose}
      onSubmit={onSubmit}
      title={initial ? "Edit Teacher" : "Add Teacher"}
      subtitle="Assign related subjects and classes"
      wide
      submitLabel={initial ? "Update Teacher" : "Add Teacher"}
    >
      {error ? <div className="alert err">{error}</div> : null}

      <div className="form-photo-row">
        <PersonPhoto
          kind="teacher"
          id={initial?._id}
          url={photoSrc("teacher", initial ?? { _id: "" })}
          name={`${form.firstName} ${form.lastName}`}
          size={84}
          editable
          onPicked={setPickedPhoto}
        />
        <div className="form-photo-note">
          <b>Teacher photo</b>
          <span>Shown on the teacher profile, teacher list, payslips and ID card. It is resized automatically.</span>
        </div>
      </div>

      <div className="form-section-title">Staff Information</div>
      <div className="form-grid">
        <Field label="Employee ID" required>
          <div style={{ display: "grid", gap: 6 }}>
            {!initial ? (
              <div className="chips">
                <button
                  type="button"
                  className={`filter-chip${form.idMode === "auto" ? " active" : ""}`}
                  onClick={() => {
                    setForm((p) => ({ ...p, idMode: "auto" }));
                    fetch("/api/numbers?kind=teacher")
                      .then((r) => r.json())
                      .then((d) => setForm((p) => ({ ...p, employeeId: d.next || "", idMode: "auto" })));
                  }}
                >
                  Auto
                </button>
                <button
                  type="button"
                  className={`filter-chip${form.idMode === "manual" ? " active" : ""}`}
                  onClick={() => setForm((p) => ({ ...p, idMode: "manual" }))}
                >
                  Manual
                </button>
              </div>
            ) : null}
            <input
              className={inputClass}
              value={form.employeeId}
              onChange={(e) =>
                setForm({ ...form, employeeId: e.target.value, idMode: "manual" })
              }
              placeholder="TCH-MAIN-2026-00001"
              required={form.idMode === "manual" || Boolean(initial)}
              readOnly={!initial && form.idMode === "auto"}
            />
          </div>
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

      <div className="form-section-title">Bio-data</div>
      <div className="form-grid">
        <Field label="Father / Husband Name">
          <input className={inputClass} value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
        </Field>
        <Field label="Gender">
          <select className={inputClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option value="">—</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Date of Birth">
          <input type="date" className={inputClass} value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
        </Field>
        <Field label="CNIC / National ID">
          <input className={inputClass} value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} />
        </Field>
        <Field label="Tax No. (NTN / PAN)">
          <input className={inputClass} value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} />
        </Field>
        <Field label="Marital Status">
          <select className={inputClass} value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}>
            <option value="">—</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Blood Group">
          <input className={inputClass} value={form.bloodGroup} onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })} placeholder="e.g. B+" />
        </Field>
        <Field label="City">
          <input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="Address">
          <input className={inputClass} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Emergency Contact Name">
          <input className={inputClass} value={form.emergencyName} onChange={(e) => setForm({ ...form, emergencyName: e.target.value })} />
        </Field>
        <Field label="Emergency Contact Phone">
          <input className={inputClass} value={form.emergencyPhone} onChange={(e) => setForm({ ...form, emergencyPhone: e.target.value })} />
        </Field>
      </div>

      <div className="form-section-title">Job, Salary &amp; Bank</div>
      <div className="form-grid">
        <Field label="Designation">
          <input className={inputClass} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Senior Teacher" />
        </Field>
        <Field label="Department">
          <input className={inputClass} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Science" />
        </Field>
        <Field label="Experience (years)">
          <input type="number" min={0} className={inputClass} value={form.experienceYears} onChange={(e) => setForm({ ...form, experienceYears: e.target.value })} />
        </Field>
        <Field label="Basic Salary (monthly)">
          <input type="number" min={0} className={inputClass} value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} />
        </Field>
        <Field label="Allowances (monthly)">
          <input type="number" min={0} className={inputClass} value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} />
        </Field>
        <Field label="Bank Name">
          <input className={inputClass} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
        </Field>
        <Field label="Bank Account / IBAN">
          <input className={inputClass} value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })} />
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
