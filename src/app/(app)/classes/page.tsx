"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, MiniAvatar, Panel } from "@/components/ui";
import { ClassForm } from "@/components/forms/SchoolForms";
import {
  ClassItem,
  STAGE_LABEL,
  STAGE_ORDER,
  StudentItem,
  SubjectItem,
  TeacherItem,
  idOf,
} from "@/lib/types";

type SessionItem = {
  _id: string;
  name: string;
  code: string;
  status: "draft" | "active" | "closed";
  startDate?: string;
  endDate?: string;
  classCount?: number;
};

type CatalogStage = {
  key: string;
  label: string;
  note: string;
  classes: number;
  subjects: number;
  sample: string[];
};

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogStage[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [sections, setSections] = useState("A");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [library, setLibrary] = useState(false);
  const [stageFilter, setStageFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);

  const [yearFilter, setYearFilter] = useState("");

  // Sessions
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [pageTab, setPageTab] = useState<"classes" | "sessions">("classes");
  const [sessionForm, setSessionForm] = useState({ name: "", startDate: "", endDate: "", activate: false, copyClassesFrom: "" });
  const [sessionMsg, setSessionMsg] = useState("");
  const [sessionLoading, setSessionLoading] = useState(false);

  // Promote
  const [promoteClass, setPromoteClass] = useState<ClassItem | null>(null);
  const [promoteTarget, setPromoteTarget] = useState("");
  const [promoteMsg, setPromoteMsg] = useState("");
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    const [c, t, s, sub, cat, settings, sess] = await Promise.all([
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/classes?view=curriculum").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/sessions").then((r) => r.json()),
    ]);
    setClasses(c.classes || []);
    setTeachers(t.teachers || []);
    setStudents(s.students || []);
    setSubjects(sub.subjects || []);
    const stages: CatalogStage[] = cat.curriculum?.stages || [];
    setCatalog(stages);
    setPicked((p) => (p.length ? p : stages.map((x) => x.key)));
    if (!(c.classes || []).length) setLibrary(true);
    const activeYear = settings.activeSession?.name || settings.settings?.academicYear;
    if (activeYear) {
      setYear(activeYear);
      setYearFilter((f) => f || activeYear);
    }
    setSessions(sess.sessions || []);
  }, []);

  async function addSession() {
    if (!sessionForm.name.trim()) return;
    setSessionLoading(true);
    setSessionMsg("");
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sessionForm.name.trim(),
        startDate: sessionForm.startDate || null,
        endDate: sessionForm.endDate || null,
        activate: sessionForm.activate,
        copyClassesFrom: sessionForm.copyClassesFrom || null,
      }),
    });
    const data = await res.json();
    setSessionLoading(false);
    if (!res.ok) { setSessionMsg(data.error || "Could not create session"); return; }
    setSessionMsg(`Session "${sessionForm.name}" created.`);
    setSessionForm({ name: "", startDate: "", endDate: "", activate: false, copyClassesFrom: "" });
    load();
  }

  async function activateSession(id: string) {
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "activate" }),
    });
    if (res.ok) load();
    else { const d = await res.json(); alert(d.error || "Could not activate"); }
  }

  async function promoteAll() {
    if (!promoteClass || !promoteTarget) return;
    setPromoting(true);
    setPromoteMsg("");
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "promote-all", fromClassId: promoteClass._id, toClassId: promoteTarget }),
    });
    const data = await res.json();
    setPromoting(false);
    if (!res.ok) { setPromoteMsg(data.error || "Promotion failed"); return; }
    setPromoteMsg(`Done: ${data.promoted} student(s) moved from ${data.from} → ${data.to}`);
    load();
  }

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this class?")) return;
    const res = await fetch(`/api/classes/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) alert(data.error || "Could not delete this class");
    load();
  }

  async function importCurriculum() {
    if (!picked.length) return;
    setImporting(true);
    setMessage("");
    const res = await fetch("/api/classes?kind=curriculum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stages: picked,
        academicYear: year,
        sections: sections
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      }),
    });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) {
      setMessage(data.error || "Import failed");
      return;
    }
    const done = data.imported;
    setMessage(
      `Imported ${done.subjects} subjects · ${done.classesCreated} classes created, ${done.classesUpdated} refreshed for ${done.academicYear}.`
    );
    load();
  }

  function countFor(classId: string) {
    return students.filter((s) => idOf(s.classId) === classId).length;
  }

  const years = useMemo(() => {
    const set = new Set(classes.map((c) => c.academicYear).filter(Boolean));
    if (year) set.add(year);
    return [...set].sort().reverse();
  }, [classes, year]);

  const grouped = useMemo(() => {
    const visible = classes.filter((c) => {
      if (yearFilter && c.academicYear !== yearFilter) return false;
      if (stageFilter && (c.stage || "unassigned") !== stageFilter) return false;
      return true;
    });
    const map = new Map<string, ClassItem[]>();
    for (const c of visible) {
      const key = c.stage || "unassigned";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    const order = [...STAGE_ORDER, "unassigned"];
    return order
      .filter((k) => map.has(k))
      .map((k) => ({ key: k, label: STAGE_LABEL[k] ?? k, items: map.get(k)! }));
  }, [classes, stageFilter, yearFilter]);

  const totalPicked = catalog
    .filter((s) => picked.includes(s.key))
    .reduce((sum, s) => sum + s.classes, 0);

  // Classes eligible as promote targets (exclude the source class itself)
  const promoteTargets = useMemo(() => {
    if (!promoteClass) return [];
    return classes
      .filter((c) => c._id !== promoteClass._id)
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.academicYear.localeCompare(b.academicYear) || a.name.localeCompare(b.name));
  }, [classes, promoteClass]);

  return (
    <>
      <Hero
        title="Classes & Sections"
        subtitle={`${classes.length} sections · ${subjects.length} subjects · session ${year}`}
        actionLabel="Add Class"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <div className="accounting-toolbar">
        <select
          className="inp"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          style={{ maxWidth: 180 }}
        >
          <option value="">All sessions</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          className="inp"
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ maxWidth: 220 }}
        >
          <option value="">All stages</option>
          {STAGE_ORDER.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
          <option value="unassigned">Unassigned</option>
        </select>
        <button type="button" className="btn-ghost" onClick={() => setLibrary((v) => !v)}>
          {library ? "Hide Library" : "Curriculum Library"}
        </button>
      </div>

      <div className="tabs">
        <button type="button" className={`tab${pageTab === "classes" ? " active" : ""}`} onClick={() => setPageTab("classes")}>
          Classes &amp; Sections
        </button>
        <button type="button" className={`tab${pageTab === "sessions" ? " active" : ""}`} onClick={() => setPageTab("sessions")}>
          Academic Sessions
          {sessions.length > 0 ? <span className="chip-badge" style={{ marginLeft: 5 }}>{sessions.length}</span> : null}
        </button>
      </div>

      {library ? (
        <Panel
          title="Curriculum Library"
          meta={`${totalPicked} CLASSES SELECTED`}
        >
          <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-dim)" }}>
            Ready-made academic ladder from Pre-Nursery to postgraduate programmes, each class
            arriving with its own subject list. Importing again refreshes subject mapping without
            duplicating classes.
          </p>

          <div className="stage-grid">
            {catalog.map((stage) => {
              const on = picked.includes(stage.key);
              return (
                <button
                  type="button"
                  key={stage.key}
                  className={`stage-card${on ? " on" : ""}`}
                  onClick={() =>
                    setPicked((p) =>
                      p.includes(stage.key) ? p.filter((k) => k !== stage.key) : [...p, stage.key]
                    )
                  }
                >
                  <div className="stage-head">
                    <b>{stage.label}</b>
                    <span className={`tick${on ? " on" : ""}`}>{on ? "✓" : ""}</span>
                  </div>
                  <div className="stage-note">{stage.note}</div>
                  <div className="stage-meta">
                    {stage.classes} classes · {stage.subjects} subjects
                  </div>
                  <div className="stage-sample">{stage.sample.join(" · ")}…</div>
                </button>
              );
            })}
          </div>

          <div className="import-row">
            <label>
              Session
              <input className="inp" value={year} onChange={(e) => setYear(e.target.value)} />
            </label>
            <label>
              Sections (comma separated)
              <input
                className="inp"
                value={sections}
                onChange={(e) => setSections(e.target.value)}
                placeholder="A, B"
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              onClick={importCurriculum}
              disabled={importing || !picked.length}
            >
              {importing ? "Importing…" : "Import Selected"}
            </button>
          </div>
          {message ? <div className="alert ok" style={{ marginTop: 12 }}>{message}</div> : null}
        </Panel>
      ) : null}

      {pageTab === "sessions" ? (
        <Panel title="Academic Sessions" meta={`${sessions.length} sessions`}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Session</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Code</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Classes</th>
                <th style={{ textAlign: "left", padding: "4px 8px" }}>Status</th>
                <th style={{ padding: "4px 8px" }} />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s._id} style={{ borderBottom: "1px solid var(--border-light, #eee)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: "6px 8px", color: "var(--text-dim)" }}>{s.code}</td>
                  <td style={{ padding: "6px 8px" }}>{s.classCount ?? 0}</td>
                  <td style={{ padding: "6px 8px" }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 99, fontSize: 11,
                      background: s.status === "active" ? "var(--green-bg, #d4f7e7)" : s.status === "closed" ? "var(--red-bg, #fde8e8)" : "var(--bg-soft, #f0f0f0)",
                      color: s.status === "active" ? "var(--green, #157A5C)" : s.status === "closed" ? "var(--red, #c0392b)" : "var(--text-dim)",
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {s.status !== "active" && (
                      <button type="button" className="link-btn" onClick={() => activateSession(s._id)}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!sessions.length && (
                <tr><td colSpan={5} style={{ padding: "12px 8px", color: "var(--text-dim)", textAlign: "center" }}>No sessions yet.</td></tr>
              )}
            </tbody>
          </table>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Add New Session</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Session Name *
                <input className="inp" style={{ minWidth: 160 }} placeholder="e.g. 2025–26" value={sessionForm.name} onChange={(e) => setSessionForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Start Date
                <input className="inp" type="date" value={sessionForm.startDate} onChange={(e) => setSessionForm((f) => ({ ...f, startDate: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                End Date
                <input className="inp" type="date" value={sessionForm.endDate} onChange={(e) => setSessionForm((f) => ({ ...f, endDate: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                Copy classes from
                <select className="inp" value={sessionForm.copyClassesFrom} onChange={(e) => setSessionForm((f) => ({ ...f, copyClassesFrom: e.target.value }))}>
                  <option value="">None</option>
                  {sessions.map((s) => <option key={s._id} value={s.name}>{s.name}</option>)}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 2 }}>
                <input type="checkbox" checked={sessionForm.activate} onChange={(e) => setSessionForm((f) => ({ ...f, activate: e.target.checked }))} />
                Set as active
              </label>
              <button type="button" className="btn-primary" disabled={sessionLoading || !sessionForm.name.trim()} onClick={addSession}>
                {sessionLoading ? "Adding…" : "Add Session"}
              </button>
            </div>
            {sessionMsg && <div className="alert ok" style={{ marginTop: 10 }}>{sessionMsg}</div>}
          </div>
        </Panel>
      ) : null}

      {/* Promote Students Modal */}
      {promoteClass && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            background: "var(--surface, #fff)", borderRadius: 12, padding: 28,
            width: "100%", maxWidth: 480, boxShadow: "0 8px 40px rgba(0,0,0,.2)",
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Promote Students</div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18 }}>
              Move all students from <b>{promoteClass.name}-{promoteClass.section}</b> ({promoteClass.academicYear}) to a new class.
              Names, admission numbers, and roll numbers stay unchanged.
            </div>
            <div style={{ marginBottom: 4, fontSize: 12, fontWeight: 600 }}>Students in this class</div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>
              {students.filter((s) => idOf(s.classId) === promoteClass._id).length} student(s)
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, marginBottom: 16 }}>
              Target Class (promote to)
              <select className="inp" value={promoteTarget} onChange={(e) => { setPromoteTarget(e.target.value); setPromoteMsg(""); }}>
                <option value="">— select target class —</option>
                {promoteTargets.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}-{c.section} · Session: {c.academicYear}
                  </option>
                ))}
              </select>
            </label>
            {promoteMsg && (
              <div className={`alert ${promoteMsg.startsWith("Done") ? "ok" : ""}`} style={{ marginBottom: 12 }}>{promoteMsg}</div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" className="btn-dark" onClick={() => { setPromoteClass(null); setPromoteTarget(""); setPromoteMsg(""); }}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={!promoteTarget || promoting} onClick={promoteAll}>
                {promoting ? "Promoting…" : "Promote All Students"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pageTab === "classes" ? (
        <>
          {!classes.length ? <EmptyState message="No classes yet. Import the curriculum library above or add a class manually." /> : null}
          {grouped.map((group) => (
            <div key={group.key} style={{ marginBottom: 8 }}>
            <div className="stage-title">
              {group.label}
              <span>{group.items.length} classes</span>
            </div>
            <div className="class-grid">
              {group.items.map((c) => {
                const enrolled = countFor(c._id);
                const list = c.subjects ?? [];
                return (
                  <div className="class-card" key={c._id}>
                    <div className="cc-top">
                      <div className="cc-grade">
                        {c.name}-{c.section}
                      </div>
                      <div className="cc-sec">{enrolled} students</div>
                    </div>
                    {c.stream ? <div className="cc-stream">{c.stream}</div> : null}
                    <div className="cc-row">
                      <span>Room</span>
                      <b>{c.room || "—"}</b>
                    </div>
                    <div className="cc-row">
                      <span>Capacity</span>
                      <b>{c.capacity}</b>
                    </div>
                    <div className="cc-row">
                      <span>Session</span>
                      <b>{c.academicYear}</b>
                    </div>
                    <div className="cc-subjects">
                      {list.length ? (
                        list.map((s) => (
                          <span className="chip" key={s._id} title={`${s.code} · ${s.credits}`}>
                            {s.name}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          No subjects mapped
                        </span>
                      )}
                    </div>
                    <div className="cc-teacher">
                      <MiniAvatar
                        name={
                          c.classTeacher
                            ? `${c.classTeacher.firstName} ${c.classTeacher.lastName}`
                            : "N A"
                        }
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>
                          {c.classTeacher
                            ? `${c.classTeacher.firstName} ${c.classTeacher.lastName}`
                            : "Not assigned"}
                        </div>
                        <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>Class Teacher</div>
                      </div>
                    </div>
                    <div
                      className="row-actions"
                      style={{ marginTop: 12, justifyContent: "flex-start" }}
                    >
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => {
                          setEditing(c);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => { setPromoteClass(c); setPromoteTarget(""); setPromoteMsg(""); }}
                      >
                        Promote
                      </button>
                      <button
                        type="button"
                        className="link-btn danger"
                        onClick={() => remove(c._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          ))}
        </>
      ) : null}


      <ClassForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        teachers={teachers}
        subjects={subjects}
        defaultYear={year}
      />
    </>
  );
}
