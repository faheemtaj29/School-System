"use client";

import { FormEvent, Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  EmptyState,
  Field,
  Hero,
  NameCell,
  Panel,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { prettyDate } from "@/lib/types";

type Block = { title: string; text?: string };

type Content = {
  brandName: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  heroCtaLabel: string;
  aboutTitle: string;
  aboutBody: string;
  features: Block[];
  stats: Block[];
  admissionsTitle: string;
  admissionsBody: string;
  contactTitle: string;
  contactBody: string;
  email?: string;
  phone?: string;
  address?: string;
  facebook?: string;
  showCourses: boolean;
  published: boolean;
};

type Application = {
  _id: string;
  applicantName: string;
  gender?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  nationality?: string;
  religion?: string;
  bloodGroup?: string;
  studentCnic?: string;
  previousSchool?: string;
  previousClass?: string;
  lastResult?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianCnic?: string;
  guardianPhone?: string;
  guardianEmail?: string;
  guardianOccupation?: string;
  motherName?: string;
  motherCnic?: string;
  motherPhone?: string;
  motherOccupation?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  emergencyRelation?: string;
  branchCode: string;
  academicYear?: string;
  interest: string;
  classApplied?: string;
  courseId?: { code: string; title: string } | string | null;
  transportRequired?: boolean;
  medicalNotes?: string;
  howHeard?: string;
  message?: string;
  status: string;
  createdAt: string;
};

const empty: Content = {
  brandName: "",
  tagline: "",
  heroTitle: "",
  heroSubtitle: "",
  heroCtaLabel: "Apply Now",
  aboutTitle: "",
  aboutBody: "",
  features: [],
  stats: [],
  admissionsTitle: "",
  admissionsBody: "",
  contactTitle: "",
  contactBody: "",
  showCourses: true,
  published: true,
};

export default function WebsitePage() {
  const [tab, setTab] = useState<"content" | "blocks" | "leads">("content");
  const [form, setForm] = useState<Content>(empty);
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState({ new: 0, contacted: 0, enrolled: 0, rejected: 0 });
  const [statusFilter, setStatusFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const [site, leads] = await Promise.all([
      fetch("/api/site").then((r) => r.json()),
      fetch(`/api/site/admissions${qs}`).then((r) => r.json()),
    ]);
    if (site.content) setForm({ ...empty, ...site.content });
    setApps(leads.applications || []);
    setStats(leads.stats || { new: 0, contacted: 0, enrolled: 0, rejected: 0 });
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/site", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setForm({ ...empty, ...data.content });
    setMsg("Website updated — changes are live on the public site.");
  }

  function setBlock(key: "features" | "stats", index: number, patch: Partial<Block>) {
    const list = [...form[key]];
    list[index] = { ...list[index], ...patch };
    setForm({ ...form, [key]: list });
  }

  function addBlock(key: "features" | "stats") {
    setForm({ ...form, [key]: [...form[key], { title: "", text: "" }] });
  }

  function removeBlock(key: "features" | "stats", index: number) {
    setForm({ ...form, [key]: form[key].filter((_, i) => i !== index) });
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/site/admissions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function removeApp(id: string) {
    if (!confirm("Delete this application?")) return;
    await fetch(`/api/site/admissions/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <Hero
        title="Website & Admissions"
        subtitle="Manage every public page, courses visibility and incoming applications"
      />

      <div className="pay-stat-row">
        <div className="pay-stat"><div className="tag">New Leads</div><div className="num" style={{ color: "var(--jade-dark)" }}>{stats.new}</div></div>
        <div className="pay-stat"><div className="tag">Contacted</div><div className="num">{stats.contacted}</div></div>
        <div className="pay-stat"><div className="tag">Enrolled</div><div className="num">{stats.enrolled}</div></div>
        <div className="pay-stat">
          <div className="tag">Public Site</div>
          <div className="num" style={{ fontSize: 16 }}>
            <Link href="/" target="_blank">Open website →</Link>
          </div>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["content", "Page Content"],
            ["blocks", "Features & Stats"],
            ["leads", "Applications"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      {tab === "content" ? (
        <Panel title="Public pages">
          <form onSubmit={save}>
            <div className="form-grid">
              <Field label="School / brand name" required>
                <input className={inputClass} value={form.brandName} onChange={(e) => setForm({ ...form, brandName: e.target.value })} required />
              </Field>
              <Field label="Tagline" required>
                <input className={inputClass} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} required />
              </Field>
              <Field label="Hero heading" required>
                <input className={inputClass} value={form.heroTitle} onChange={(e) => setForm({ ...form, heroTitle: e.target.value })} required />
              </Field>
              <Field label="Hero button label">
                <input className={inputClass} value={form.heroCtaLabel} onChange={(e) => setForm({ ...form, heroCtaLabel: e.target.value })} />
              </Field>
            </div>

            <div className="form-grid one" style={{ marginTop: 14 }}>
              <Field label="Hero paragraph" required>
                <textarea className={inputClass} rows={3} value={form.heroSubtitle} onChange={(e) => setForm({ ...form, heroSubtitle: e.target.value })} required />
              </Field>
            </div>

            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="About heading" required>
                <input className={inputClass} value={form.aboutTitle} onChange={(e) => setForm({ ...form, aboutTitle: e.target.value })} required />
              </Field>
              <Field label="Admissions heading" required>
                <input className={inputClass} value={form.admissionsTitle} onChange={(e) => setForm({ ...form, admissionsTitle: e.target.value })} required />
              </Field>
            </div>

            <div className="form-grid one" style={{ marginTop: 14 }}>
              <Field label="About text" required>
                <textarea className={inputClass} rows={3} value={form.aboutBody} onChange={(e) => setForm({ ...form, aboutBody: e.target.value })} required />
              </Field>
              <Field label="Admissions text" required>
                <textarea className={inputClass} rows={2} value={form.admissionsBody} onChange={(e) => setForm({ ...form, admissionsBody: e.target.value })} required />
              </Field>
            </div>

            <div className="form-grid" style={{ marginTop: 14 }}>
              <Field label="Contact heading" required>
                <input className={inputClass} value={form.contactTitle} onChange={(e) => setForm({ ...form, contactTitle: e.target.value })} required />
              </Field>
              <Field label="Contact text" required>
                <input className={inputClass} value={form.contactBody} onChange={(e) => setForm({ ...form, contactBody: e.target.value })} required />
              </Field>
              <Field label="Public phone">
                <input className={inputClass} value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Public email">
                <input className={inputClass} value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Address">
                <input className={inputClass} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <Field label="Facebook URL">
                <input className={inputClass} value={form.facebook || ""} onChange={(e) => setForm({ ...form, facebook: e.target.value })} />
              </Field>
              <Field label="Show courses on website">
                <select className={inputClass} value={form.showCourses ? "yes" : "no"} onChange={(e) => setForm({ ...form, showCourses: e.target.value === "yes" })}>
                  <option value="yes">Yes — list open courses</option>
                  <option value="no">No — hide courses</option>
                </select>
              </Field>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-dark">Save & publish</button>
            </div>
          </form>
        </Panel>
      ) : null}

      {tab === "blocks" ? (
        <div className="grid-2">
          <Panel title="Feature cards" meta={`${form.features.length} ITEMS`}>
            {form.features.map((b, i) => (
              <div className="form-grid" key={`f${i}`} style={{ marginBottom: 12 }}>
                <Field label={`Title ${i + 1}`}>
                  <input className={inputClass} value={b.title} onChange={(e) => setBlock("features", i, { title: e.target.value })} />
                </Field>
                <Field label="Text">
                  <input className={inputClass} value={b.text || ""} onChange={(e) => setBlock("features", i, { text: e.target.value })} />
                </Field>
                <button type="button" className="link-btn danger" onClick={() => removeBlock("features", i)}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn-dark" onClick={() => addBlock("features")}>Add feature</button>
          </Panel>

          <Panel title="Stat counters" meta={`${form.stats.length} ITEMS`}>
            {form.stats.map((b, i) => (
              <div className="form-grid" key={`s${i}`} style={{ marginBottom: 12 }}>
                <Field label={`Number ${i + 1}`}>
                  <input className={inputClass} value={b.title} onChange={(e) => setBlock("stats", i, { title: e.target.value })} placeholder="1200+" />
                </Field>
                <Field label="Label">
                  <input className={inputClass} value={b.text || ""} onChange={(e) => setBlock("stats", i, { text: e.target.value })} placeholder="Students" />
                </Field>
                <button type="button" className="link-btn danger" onClick={() => removeBlock("stats", i)}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn-dark" onClick={() => addBlock("stats")}>Add stat</button>
            <div className="form-actions">
              <button type="button" className="btn-dark" onClick={(e) => save(e as unknown as FormEvent)}>
                Save all blocks
              </button>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "leads" ? (
        <Panel title="Admission applications" meta={`${apps.length} RECORDS`}>
          <div className="chips" style={{ marginBottom: 14 }}>
            {["", "new", "contacted", "enrolled", "rejected"].map((f) => (
              <button
                key={f || "all"}
                type="button"
                className={`filter-chip${statusFilter === f ? " active" : ""}`}
                onClick={() => setStatusFilter(f)}
              >
                {f || "All"}
              </button>
            ))}
          </div>

          {!apps.length ? (
            <EmptyState message="No applications yet. Share the website admissions page to collect them." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Guardian CNIC</th>
                    <th>Contact</th>
                    <th>Branch</th>
                    <th>Interest</th>
                    <th>Received</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map((a) => {
                    const course = typeof a.courseId === "object" && a.courseId ? a.courseId : null;
                    const open = openId === a._id;
                    return (
                      <Fragment key={a._id}>
                        <tr>
                          <td>
                            <NameCell
                              name={a.applicantName}
                              sub={[a.guardianName, a.studentCnic].filter(Boolean).join(" · ") || a.city || ""}
                            />
                          </td>
                          <td className="num">{a.guardianCnic || "—"}</td>
                          <td>
                            <div className="num">{a.phone}</div>
                            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                              {a.city || a.email || "—"}
                            </div>
                          </td>
                          <td className="num">{a.branchCode}</td>
                          <td>
                            {a.interest === "course"
                              ? course
                                ? `${course.code} — ${course.title}`
                                : "Course"
                              : a.classApplied || "School admission"}
                          </td>
                          <td>{prettyDate(a.createdAt)}</td>
                          <td className="right">
                            <StatusBadge
                              status={
                                a.status === "enrolled"
                                  ? "active"
                                  : a.status === "rejected"
                                    ? "overdue"
                                    : a.status === "contacted"
                                      ? "info"
                                      : "pending"
                              }
                            />
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => setOpenId(open ? null : a._id)}
                              >
                                {open ? "Hide" : "View"}
                              </button>
                              {a.status === "new" ? (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => setStatus(a._id, "contacted")}
                                >
                                  Contacted
                                </button>
                              ) : null}
                              {a.status !== "enrolled" ? (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => setStatus(a._id, "enrolled")}
                                >
                                  Enrolled
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="link-btn danger"
                                onClick={() => removeApp(a._id)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                        {open ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="admit-detail">
                                <div className="admit-detail-grid">
                                  <div>
                                    <b>DOB / Gender</b>
                                    {[prettyDate(a.dateOfBirth), a.gender].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Student CNIC / Form-B</b>
                                    {a.studentCnic || "—"}
                                  </div>
                                  <div>
                                    <b>Nationality / Religion</b>
                                    {[a.nationality, a.religion, a.bloodGroup].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Previous school</b>
                                    {[a.previousSchool, a.previousClass, a.lastResult]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Guardian</b>
                                    {[a.guardianName, a.guardianRelation, a.guardianOccupation]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Guardian phone / email</b>
                                    {[a.guardianPhone, a.guardianEmail].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Mother</b>
                                    {[a.motherName, a.motherCnic, a.motherPhone]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Address</b>
                                    {[a.address, a.city, a.province, a.postalCode]
                                      .filter(Boolean)
                                      .join(", ") || "—"}
                                  </div>
                                  <div>
                                    <b>Emergency</b>
                                    {[a.emergencyName, a.emergencyRelation, a.emergencyPhone]
                                      .filter(Boolean)
                                      .join(" · ") || "—"}
                                  </div>
                                  <div>
                                    <b>Session / Transport</b>
                                    {[
                                      a.academicYear,
                                      a.transportRequired ? "Transport yes" : "Transport no",
                                      a.howHeard,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </div>
                                  <div>
                                    <b>WhatsApp</b>
                                    {a.whatsapp || "—"}
                                  </div>
                                  <div>
                                    <b>Medical</b>
                                    {a.medicalNotes || "—"}
                                  </div>
                                </div>
                                {a.message ? (
                                  <p style={{ margin: "12px 0 0", color: "var(--text-dim)" }}>
                                    Message: {a.message}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}
    </>
  );
}
