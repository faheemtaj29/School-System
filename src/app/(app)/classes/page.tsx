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

  const load = useCallback(async () => {
    const [c, t, s, sub, cat, settings] = await Promise.all([
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/classes?view=curriculum").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
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
  }, []);

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
        <button type="button" className="btn-dark" onClick={() => setLibrary((v) => !v)}>
          {library ? "Hide Curriculum Library" : "Curriculum Library"}
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

      {!classes.length ? (
        <EmptyState message="No classes yet. Import the curriculum library above or add a class manually." />
      ) : (
        grouped.map((group) => (
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
        ))
      )}

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
