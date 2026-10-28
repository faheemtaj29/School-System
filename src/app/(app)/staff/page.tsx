"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  ModalForm,
  NameCell,
  Panel,
  PortalAccessButton,
  RowMenu,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { PersonPhoto, savePickedPhoto } from "@/components/PersonPhoto";
import { formatCnic } from "@/components/forms/PeopleForms";
import { fullName, photoSrc } from "@/lib/types";

type StaffItem = {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  cnic?: string;
  address?: string;
  photoUpdatedAt?: string;
  department: string;
  designation: string;
  status: string;
  branchCode?: string;
  user?: string;
};

const blank = {
  employeeId: "",
  idMode: "auto",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  cnic: "",
  address: "",
  department: "Administration",
  designation: "Clerk",
  status: "active",
  branchCode: "",
};

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffItem | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pickedPhoto, setPickedPhoto] = useState<string | null>(null);

  const filtered = useMemo(() =>
    !search ? staff : staff.filter((s) =>
      fullName(s).toLowerCase().includes(search.toLowerCase()) ||
      s.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      s.department.toLowerCase().includes(search.toLowerCase())
    ), [staff, search]);

  const load = useCallback(async () => {
    const d = await fetch("/api/staff").then((r) => r.json());
    setStaff(d.staff || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        employeeId: editing.employeeId,
        idMode: "manual",
        firstName: editing.firstName,
        lastName: editing.lastName,
        email: editing.email,
        phone: editing.phone || "",
        cnic: editing.cnic || "",
        address: editing.address || "",
        department: editing.department,
        designation: editing.designation,
        status: editing.status,
        branchCode: editing.branchCode || "",
      });
    } else {
      setForm(blank);
      fetch("/api/numbers?kind=staff")
        .then((r) => r.json())
        .then((d) =>
          setForm((prev) => ({
            ...prev,
            employeeId: d.next || "",
            idMode: d.modes?.employeeIdMode === "manual" ? "manual" : "auto",
          }))
        )
        .catch(() => undefined);
    }
    setError("");
  }, [open, editing]);

  async function save(e: FormEvent) {
    e.preventDefault();
    const { idMode, ...rest } = form;
    const payload = {
      ...rest,
      employeeId: idMode === "auto" && !editing ? "" : form.employeeId,
    };
    const res = await fetch(editing ? `/api/staff/${editing._id}` : "/api/staff", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    if (!editing) await savePickedPhoto("staff", data.staff?._id, pickedPhoto);
    setPickedPhoto(null);
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this staff member?")) return;
    await fetch(`/api/staff/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <Hero
        title="Campus Staff"
        subtitle={`${staff.length} non-teaching employees · grant Staff portal login`}
        actionLabel="Add Staff"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
        extra={
          <button type="button" className="btn-hero" onClick={() => window.open("/print/id-cards?kind=staff", "_blank")}>
            Print ID cards
          </button>
        }
      />

      {staff.length > 0 ? (
        <div className="toolbar">
          <input
            type="search"
            className={inputClass}
            placeholder="Search by name, ID or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
        </div>
      ) : null}

      {!staff.length ? (
        <EmptyState message="Add clerks, accountants, librarians and other campus staff, then create their Staff portal login." />
      ) : (
        <Panel title="Staff directory" meta={`${filtered.length} PEOPLE`}>
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>ID</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th className="right">Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? filtered.map((s) => (
                  <tr key={s._id}>
                    <td>
                      <NameCell name={fullName(s)} sub={[s.phone, s.email].filter(Boolean).join(" · ")} photo={photoSrc("staff", s)} />
                    </td>
                    <td className="num">{s.employeeId}</td>
                    <td>{s.department}</td>
                    <td>{s.designation}</td>
                    <td className="right">
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setEditing(s);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <RowMenu>
                          <PortalAccessButton kind="staff" id={s._id} email={s.email} name={fullName(s)} />
                          <button type="button" className="link-btn danger" onClick={() => remove(s._id)}>
                            Delete
                          </button>
                        </RowMenu>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--text-dim)", padding: "20px 0" }}>
                      No staff match &ldquo;{search}&rdquo;
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <ModalForm
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={save}
        title={editing ? "Edit Staff" : "Add Staff Member"}
        subtitle="Then use Portal Login to create their Staff sign-in"
        submitLabel={editing ? "Save" : "Create"}
      >
        {error ? <div className="alert err">{error}</div> : null}
        <div className="form-photo-row">
          <PersonPhoto
            kind="staff"
            id={editing?._id}
            url={photoSrc("staff", editing ?? { _id: "" })}
            name={`${form.firstName} ${form.lastName}`}
            size={84}
            editable
            onPicked={setPickedPhoto}
          />
          <div className="form-photo-note">
            <b>Staff photo</b>
            <span>Shown on the staff list, payslips and ID card. It is resized automatically.</span>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Employee ID" required>
            <div style={{ display: "grid", gap: 6 }}>
              {!editing ? (
                <div className="chips">
                  <button
                    type="button"
                    className={`filter-chip${form.idMode === "auto" ? " active" : ""}`}
                    onClick={() => {
                      fetch("/api/numbers?kind=staff")
                        .then((r) => r.json())
                        .then((d) =>
                          setForm((p) => ({
                            ...p,
                            employeeId: d.next || "",
                            idMode: "auto",
                          }))
                        );
                    }}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    className={`filter-chip${form.idMode === "manual" ? " active" : ""}`}
                    onClick={() => setForm({ ...form, idMode: "manual" })}
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
                required={form.idMode === "manual" || Boolean(editing)}
                readOnly={!editing && form.idMode === "auto"}
              />
            </div>
          </Field>
          <Field label="First name" required>
            <input
              className={inputClass}
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
          </Field>
          <Field label="Last name" required>
            <input
              className={inputClass}
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              className={inputClass}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClass}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="CNIC / National ID">
            <input
              className={inputClass}
              value={form.cnic}
              onChange={(e) => setForm({ ...form, cnic: formatCnic(e.target.value) })}
              placeholder="12345-1234567-1"
            />
          </Field>
          <Field label="Address">
            <input
              className={inputClass}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="Department" required>
            <input
              className={inputClass}
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              required
            />
          </Field>
          <Field label="Designation" required>
            <input
              className={inputClass}
              value={form.designation}
              onChange={(e) => setForm({ ...form, designation: e.target.value })}
              required
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClass}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </ModalForm>
    </>
  );
}
