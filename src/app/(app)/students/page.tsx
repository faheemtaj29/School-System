"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Hero,
  NameCell,
  Panel,
  PortalAccessButton,
  StatusBadge,
  inputClass,
  Field,
} from "@/components/ui";
import { StudentForm } from "@/components/forms/PeopleForms";
import { ClassItem, StudentItem, fullName, labelOfClass, prettyDate, toDateInput } from "@/lib/types";

type DocTab = "admission" | "tc";

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  const [schoolName, setSchoolName] = useState("Sabaq Model School");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudentItem | null>(null);
  const [filterClass, setFilterClass] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [search, setSearch] = useState("");
  const [promoteMsg, setPromoteMsg] = useState("");
  const [promoting, setPromoting] = useState(false);
  // Documents modal
  const [docStudent, setDocStudent] = useState<StudentItem | null>(null);
  const [docTab, setDocTab] = useState<DocTab>("admission");
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
    if (st.settings?.schoolName) setSchoolName(st.settings.schoolName);
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
    setDocTab(s.tcNo ? "tc" : "admission");
    setTcMsg("");
    setTcForm({
      leavingDate: toDateInput(new Date()),
      leavingReason: "",
      conductRemark: "Good",
    });
  }

  function dobInWords(dob?: string) {
    if (!dob) return "—";
    const d = new Date(dob);
    return d.toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric" });
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
                      <NameCell name={fullName(s)} sub={s.phone || undefined} />
                    </td>
                    <td>{s.parentName || "—"}</td>
                    <td>{labelOfClass(s.classId as never)}</td>
                    <td className="num">{s.admissionNo}</td>
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
                          onClick={() => openDoc(s)}
                        >
                          Docs
                        </button>
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
                        <PortalAccessButton
                          kind="student"
                          id={s._id}
                          email={s.email}
                          name={fullName(s)}
                        />
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => remove(s._id)}
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
        </Panel>
      )}

      <StudentForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        classes={classes}
      />

      {/* ── Documents Modal ── */}
      {docStudent ? (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDocStudent(null); }}>
          <div
            className="modal"
            style={{ maxWidth: 680, width: "95vw" }}
          >
            <div style={{ overflowY: "auto", maxHeight: "calc(90vh - 40px)", padding: "22px 26px 24px" }}>
            {/* Tab bar */}
            <div className="chips" style={{ marginBottom: 18 }}>
              <button
                type="button"
                className={`filter-chip${docTab === "admission" ? " active" : ""}`}
                onClick={() => setDocTab("admission")}
              >
                Admission Form
              </button>
              <button
                type="button"
                className={`filter-chip${docTab === "tc" ? " active" : ""}`}
                onClick={() => setDocTab("tc")}
              >
                Leaving Certificate
              </button>
            </div>

            {/* ─── ADMISSION FORM ─── */}
            {docTab === "admission" ? (
              <div className="print-doc">
                <div className="print-header">
                  <h2 className="print-school">{schoolName}</h2>
                  <h3 className="print-title">Student Admission Form</h3>
                </div>
                <div className="print-section-title">Student Information</div>
                <div className="print-grid">
                  <div className="print-field">
                    <span className="print-label">Admission No.</span>
                    <span className="print-val">{docStudent.admissionNo}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Roll No.</span>
                    <span className="print-val">{docStudent.rollNumber || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Full Name</span>
                    <span className="print-val">{fullName(docStudent)}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Class / Section</span>
                    <span className="print-val">{labelOfClass(docStudent.classId as never)}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Date of Birth</span>
                    <span className="print-val">{dobInWords(docStudent.dateOfBirth)}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Gender</span>
                    <span className="print-val" style={{ textTransform: "capitalize" }}>
                      {docStudent.gender || "—"}
                    </span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">CNIC / B-Form No.</span>
                    <span className="print-val">{docStudent.cnic || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Nationality</span>
                    <span className="print-val">{docStudent.nationality || "Pakistani"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Religion</span>
                    <span className="print-val">{docStudent.religion || "—"}</span>
                  </div>
                  <div className="print-field full">
                    <span className="print-label">Address</span>
                    <span className="print-val">{docStudent.address || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Phone</span>
                    <span className="print-val">{docStudent.phone || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Email</span>
                    <span className="print-val">{docStudent.email || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Previous School</span>
                    <span className="print-val">{docStudent.previousSchool || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Admission Date</span>
                    <span className="print-val">
                      {docStudent.admissionDate ? prettyDate(docStudent.admissionDate) : "—"}
                    </span>
                  </div>
                </div>

                <div className="print-section-title" style={{ marginTop: 20 }}>
                  Parent / Guardian Information
                </div>
                <div className="print-grid">
                  <div className="print-field">
                    <span className="print-label">Parent / Guardian Name</span>
                    <span className="print-val">{docStudent.parentName || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Contact Number</span>
                    <span className="print-val">{docStudent.parentPhone || "—"}</span>
                  </div>
                  <div className="print-field">
                    <span className="print-label">Parent Email</span>
                    <span className="print-val">{docStudent.parentEmail || "—"}</span>
                  </div>
                </div>

                <div className="print-sig-row">
                  <div className="print-sig">
                    <div className="print-sig-line" />
                    <div className="print-sig-label">Parent / Guardian Signature</div>
                  </div>
                  <div className="print-sig">
                    <div className="print-sig-line" />
                    <div className="print-sig-label">Principal Signature & Stamp</div>
                  </div>
                </div>

                <div className="form-actions no-print" style={{ marginTop: 20 }}>
                  <button type="button" className="btn-dark" onClick={() => {
                    document.body.classList.add("printing-modal");
                    window.print();
                    setTimeout(() => document.body.classList.remove("printing-modal"), 500);
                  }}>
                    Print Admission Form
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setDocStudent(null)}>
                    Close
                  </button>
                </div>
              </div>
            ) : null}

            {/* ─── LEAVING CERTIFICATE / TC ─── */}
            {docTab === "tc" ? (
              <div>
                {/* If TC already issued — show it */}
                {docStudent.tcNo ? (
                  <div className="print-doc">
                    <div className="print-header">
                      <h2 className="print-school">{schoolName}</h2>
                      <h3 className="print-title">Transfer / Leaving Certificate</h3>
                      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                        TC No: <strong>{docStudent.tcNo}</strong> &nbsp;·&nbsp; Issued:{" "}
                        {docStudent.tcIssuedDate ? prettyDate(docStudent.tcIssuedDate) : "—"}
                      </div>
                    </div>

                    <div className="print-grid">
                      <div className="print-field full">
                        <span className="print-label">This is to certify that</span>
                        <span className="print-val" style={{ fontWeight: 600 }}>
                          {fullName(docStudent)}
                        </span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Admission No.</span>
                        <span className="print-val">{docStudent.admissionNo}</span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Son / Daughter of</span>
                        <span className="print-val">{docStudent.parentName || "—"}</span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Date of Birth</span>
                        <span className="print-val">{dobInWords(docStudent.dateOfBirth)}</span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Class Last Attended</span>
                        <span className="print-val">{labelOfClass(docStudent.classId as never)}</span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Date of Admission</span>
                        <span className="print-val">
                          {docStudent.admissionDate ? prettyDate(docStudent.admissionDate) : "—"}
                        </span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Date of Leaving</span>
                        <span className="print-val">
                          {docStudent.leavingDate ? prettyDate(docStudent.leavingDate) : "—"}
                        </span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Reason for Leaving</span>
                        <span className="print-val">{docStudent.leavingReason || "—"}</span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Conduct / Character</span>
                        <span className="print-val">{docStudent.conductRemark || "Good"}</span>
                      </div>
                      <div className="print-field">
                        <span className="print-label">Dues Clearance</span>
                        <span className="print-val">All dues cleared</span>
                      </div>
                    </div>

                    <div className="print-sig-row">
                      <div className="print-sig">
                        <div className="print-sig-line" />
                        <div className="print-sig-label">Class Teacher</div>
                      </div>
                      <div className="print-sig">
                        <div className="print-sig-line" />
                        <div className="print-sig-label">Principal Signature & Stamp</div>
                      </div>
                    </div>

                    <div className="form-actions no-print" style={{ marginTop: 20 }}>
                      <button type="button" className="btn-dark" onClick={() => {
                        document.body.classList.add("printing-modal");
                        window.print();
                        setTimeout(() => document.body.classList.remove("printing-modal"), 500);
                      }}>
                        Print TC
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setDocStudent(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Issue TC form */
                  <form onSubmit={issueTc}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                        Issue Leaving Certificate
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                        Student: <strong>{fullName(docStudent)}</strong> ·{" "}
                        {labelOfClass(docStudent.classId as never)}
                      </div>
                    </div>
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
                          placeholder="e.g. Transfer, Fee default, Completion…"
                        />
                      </Field>
                      <Field label="Conduct / Character Remark">
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
                    <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "12px 0" }}>
                      Issuing a TC will set this student&apos;s status to Inactive and assign a
                      unique TC number.
                    </p>
                    <div className="form-actions">
                      <button type="submit" className="btn-dark">
                        Issue TC
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setDocStudent(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : null}
            </div>{/* end scrollable wrapper */}
          </div>
        </div>
      ) : null}
    </>
  );
}
