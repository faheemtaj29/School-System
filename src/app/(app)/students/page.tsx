"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Hero,
  NameCell,
  Panel,
  PortalAccessButton,
  RowMenu,
  StatusBadge,
  inputClass,
  Field,
  ModalForm,
} from "@/components/ui";
import { ImportStudents } from "@/components/students/ImportStudents";
import { StudentForm } from "@/components/forms/PeopleForms";
import { ClassItem, StudentItem, fullName, labelOfClass, photoSrc, prettyDate, toDateInput } from "@/lib/types";

const DOCS = [
  ["admission", "Admission form", "Filled in, for the parent to sign"],
  ["character", "Character certificate", "Conduct from the student record"],
  ["studying", "Studying certificate", "Bonafide student of this class"],
  ["clearance", "Fee clearance", "Only when nothing is unpaid"],
  ["leaving", "School leaving certificate", "With the dues position"],
] as const;

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudentItem | null>(null);
  const [filterClass, setFilterClass] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [search, setSearch] = useState("");
  const [promoteMsg, setPromoteMsg] = useState("");
  const [promoting, setPromoting] = useState(false);
  // Documents modal
  const [docStudent, setDocStudent] = useState<StudentItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [tcForm, setTcForm] = useState({
    leavingDate: toDateInput(new Date()),
    leavingReason: "",
    conductRemark: "Good",
  });
  const [tcMsg, setTcMsg] = useState("");

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterClass) qs.set("classId", filterClass);
    if (filterBranch) qs.set("branch", filterBranch);
    const query = qs.toString() ? `?${qs}` : "";
    const [s, c, st] = await Promise.all([
      fetch(`/api/students${query}`).then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]);
    setStudents(s.students || []);
    setClasses(c.classes || []);
    setBranches(st.settings?.branches || []);
  }, [filterClass, filterBranch]);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this student record?")) return;
    await fetch(`/api/students/${id}`, { method: "DELETE" });
    load();
  }

  async function issueTc(e: FormEvent) {
    e.preventDefault();
    if (!docStudent) return;
    setTcMsg("");
    const res = await fetch(`/api/students/${docStudent._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "issue-tc", ...tcForm }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTcMsg(data.error || "Could not issue TC");
      return;
    }
    setTcMsg(`TC issued: ${data.student?.tcNo || ""}`);
    // Refresh student in state with new TC fields
    setDocStudent(data.student);
    load();
  }

  function openDoc(s: StudentItem) {
    setDocStudent(s);
    setTcMsg("");
    setTcForm({
      leavingDate: toDateInput(new Date()),
      leavingReason: "",
      conductRemark: "Good",
    });
  }

  async function promoteClass(dryRun: boolean) {
    if (!filterClass) {
      setPromoteMsg("Filter to one class first, then run promotion.");
      return;
    }
    setPromoting(true);
    setPromoteMsg("");
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "promote",
          classId: filterClass,
          examType: "final",
          dryRun,
          passMark: 40,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPromoteMsg(data.error || "Promotion failed");
        return;
      }
      const s = data.summary || {};
      setPromoteMsg(
        `${dryRun ? "Preview" : "Done"}: ${s.promoted || 0} promoted` +
          (data.next ? ` → ${data.next}` : " (no next class — graduated)") +
          ` · ${s.held || 0} held · ${s.graduated || 0} graduated`
      );
      if (!dryRun) load();
    } finally {
      setPromoting(false);
    }
  }

  const activeClass = classes.find((c) => c._id === filterClass);

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        fullName(s).toLowerCase().includes(q) ||
        (s.admissionNo || "").toLowerCase().includes(q) ||
        (s.rollNumber || "").toLowerCase().includes(q)
    );
  }, [students, search]);

  return (
    <>
      <Hero
        title="Students"
        subtitle={`${students.length} enrolled · ${
          branches.find((b) => b.code === filterBranch)?.name || "All campuses"
        }`}
        extra={
          <>
            <button type="button" className="btn-hero" onClick={() => setImporting(true)}>
              Import from Excel
            </button>
            <a
              className="btn-hero"
              href={`/print/id-cards?classIds=${(filterClass ? [filterClass] : classes.map((c) => c._id)).join(",")}`}
              target="_blank"
              rel="noreferrer"
            >
              {filterClass ? "ID cards (this class)" : "ID cards (all)"}
            </a>
          </>
        }
        actionLabel="Add Student"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      {filterClass ? (
        <Panel title="Auto-promote passed students" meta={activeClass ? `${activeClass.name}-${activeClass.section}` : ""}>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 12 }}>
            Uses final-exam result cards (pass ≥ 40%). Passed students move to the next class on the
            curriculum ladder; failures stay; top-of-ladder students graduate.
          </p>
          {promoteMsg ? <div className="alert">{promoteMsg}</div> : null}
          <div className="form-actions" style={{ marginTop: 0 }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={promoting}
              onClick={() => promoteClass(true)}
            >
              Preview promotion
            </button>
            <button
              type="button"
              className="btn-dark"
              disabled={promoting}
              onClick={() => {
                if (confirm("Promote all passed students in this class?")) promoteClass(false);
              }}
            >
              {promoting ? "Working…" : "Promote passed students"}
            </button>
          </div>
        </Panel>
      ) : null}

      <div className="toolbar">
        <input
          className={inputClass}
          style={{ maxWidth: 260, marginBottom: 0 }}
          placeholder="Search by name, admission no. or roll no."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {/* A few classes read well as chips; a long list becomes a dropdown instead of a wall of buttons. */}
        {classes.length > 8 ? (
          <select
            className={inputClass}
            style={{ maxWidth: 260, marginBottom: 0 }}
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            aria-label="Filter by class"
          >
            <option value="">All classes ({classes.length})</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} - {c.section}
              </option>
            ))}
          </select>
        ) : (
          <div className="chips">
            <button
              type="button"
              className={`filter-chip${!filterClass ? " active" : ""}`}
              onClick={() => setFilterClass("")}
            >
              All Classes
            </button>
            {classes.map((c) => (
              <button
                key={c._id}
                type="button"
                className={`filter-chip${filterClass === c._id ? " active" : ""}`}
                onClick={() => setFilterClass(c._id)}
              >
                {c.name}-{c.section}
              </button>
            ))}
          </div>
        )}
        {branches.length > 1 ? (
          <div className="chips">
            <button
              type="button"
              className={`filter-chip${!filterBranch ? " active" : ""}`}
              onClick={() => setFilterBranch("")}
            >
              All Campuses
            </button>
            {branches.map((b) => (
              <button
                key={b.code}
                type="button"
                className={`filter-chip${filterBranch === b.code ? " active" : ""}`}
                onClick={() => setFilterBranch(b.code)}
              >
                {b.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!filtered.length ? (
        <EmptyState message={search ? `No students match "${search}".` : "No students found. Create a class first, then enroll students."} />
      ) : (
        <Panel
          title="Class Register"
          meta={
            activeClass
              ? `GRADE ${activeClass.name} — SECTION ${activeClass.section}`
              : `ALL CLASSES · ${filtered.length} SHOWN`
          }
        >
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Roll No.</th>
                  <th>Name</th>
                  <th>Guardian</th>
                  <th>Class</th>
                  <th>Admission No.</th>
                  <th>CNIC / B-Form</th>
                  <th>Concession</th>
                  <th className="right">Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s._id}>
                    <td className="num">{s.rollNumber || "—"}</td>
                    <td>
                      <NameCell
                        name={fullName(s)}
                        sub={s.phone || undefined}
                        photo={photoSrc("student", s)}
                        href={`/students/${s._id}`}
                      />
                    </td>
                    <td>
                      {s.parentName || "—"}
                      {s.parentPhone ? <div className="cell-sub">{s.parentPhone}</div> : null}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>{labelOfClass(s.classId as never)}</td>
                    <td className="num">{s.admissionNo}</td>
                    <td className="num">{s.cnic || "—"}</td>
                    <td>
                      {s.discountType && s.discountType !== "none"
                        ? `${s.discountPercent || 0}% ${String(s.discountType).replace(/_/g, " ")}`
                        : "—"}
                    </td>
                    <td className="right">
                      <StatusBadge status={s.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link href={`/students/${s._id}`} className="link-btn">
                          Profile
                        </Link>
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
                          <button type="button" className="link-btn" onClick={() => openDoc(s)}>
                            Documents & ID card
                          </button>
                          <Link href={`/fees?q=${encodeURIComponent(s.admissionNo)}`} className="link-btn">
                            Fee vouchers
                          </Link>
                          <PortalAccessButton kind="student" id={s._id} email={s.email} name={fullName(s)} />
                          <PortalAccessButton kind="parent" id={s._id} email={s.parentEmail} name={fullName(s)} />
                          <button type="button" className="link-btn danger" onClick={() => remove(s._id)}>
                            Delete
                          </button>
                        </RowMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <StudentForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        classes={classes}
      />

      {/* ── Documents: certificates open on the letterhead; leaving needs the TC issued first ── */}
      {docStudent ? (
        <ModalForm
          title="Documents & certificates"
          subtitle={`${fullName(docStudent)} · ${labelOfClass(docStudent.classId as never)}`}
          open
          onClose={() => setDocStudent(null)}
          onSubmit={docStudent.tcNo ? undefined : issueTc}
          submitLabel="Issue leaving certificate"
        >
          <div className="doc-links">
            {DOCS.map(([type, label, hint]) => (
              <a
                key={type}
                className={`doc-link${type === "leaving" && !docStudent.tcNo ? " off" : ""}`}
                href={type === "leaving" && !docStudent.tcNo ? undefined : `/print/certificate?student=${docStudent._id}&type=${type}`}
                target="_blank"
                rel="noreferrer"
              >
                <b>{label}</b>
                <span>{type === "leaving" && !docStudent.tcNo ? "Issue it below first" : hint}</span>
              </a>
            ))}
            <a className="doc-link" href={`/print/id-cards?ids=${docStudent._id}`} target="_blank" rel="noreferrer">
              <b>ID card</b>
              <span>With photo and QR code</span>
            </a>
          </div>
          {docStudent.tcNo ? (
            <p className="cell-sub">
              Leaving certificate {docStudent.tcNo} issued{" "}
              {docStudent.tcIssuedDate ? prettyDate(docStudent.tcIssuedDate) : ""}.
            </p>
          ) : (
            <>
              <div className="form-section-title">Issue leaving certificate</div>
              {tcMsg ? <div className="alert" style={{ marginBottom: 12 }}>{tcMsg}</div> : null}
              <div className="form-grid">
                <Field label="Date of Leaving" required>
                  <input
                    type="date"
                    className={inputClass}
                    value={tcForm.leavingDate}
                    onChange={(e) => setTcForm({ ...tcForm, leavingDate: e.target.value })}
                    required
                  />
                </Field>
                <Field label="Reason for Leaving">
                  <input
                    type="text"
                    className={inputClass}
                    value={tcForm.leavingReason}
                    onChange={(e) => setTcForm({ ...tcForm, leavingReason: e.target.value })}
                    placeholder="e.g. Transfer, Completion…"
                  />
                </Field>
                <Field label="Conduct / Character">
                  <select
                    className={inputClass}
                    value={tcForm.conductRemark}
                    onChange={(e) => setTcForm({ ...tcForm, conductRemark: e.target.value })}
                  >
                    <option>Good</option>
                    <option>Very Good</option>
                    <option>Excellent</option>
                    <option>Satisfactory</option>
                    <option>Below Average</option>
                  </select>
                </Field>
              </div>
              <p className="cell-sub" style={{ margin: "8px 0 0" }}>
                The student becomes Inactive and gets a certificate number. Unpaid fee is printed on the certificate.
              </p>
            </>
          )}
        </ModalForm>
      ) : null}

      <ImportStudents open={importing} onClose={() => setImporting(false)} onDone={load} />
    </>
  );
}
