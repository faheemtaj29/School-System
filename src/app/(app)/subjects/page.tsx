"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, NameCell, Panel } from "@/components/ui";
import { SubjectForm } from "@/components/forms/SchoolForms";
import {
  ClassItem,
  STAGE_LABEL,
  STAGE_ORDER,
  SubjectItem,
  TeacherItem,
  fullName,
  idOf,
} from "@/lib/types";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectItem | null>(null);

  const load = useCallback(async () => {
    const [s, t, c] = await Promise.all([
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
    ]);
    setSubjects(s.subjects || []);
    setTeachers(t.teachers || []);
    setClasses(c.classes || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this subject?")) return;
    await fetch(`/api/subjects/${id}`, { method: "DELETE" });
    load();
  }

  function teachersFor(subjectId: string) {
    return teachers.filter((t) =>
      (t.subjects as SubjectItem[]).some((s) => idOf(s as never) === subjectId)
    );
  }

  /** How many classes teach each subject. */
  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of classes) {
      for (const s of c.subjects ?? []) {
        map.set(s._id, (map.get(s._id) ?? 0) + 1);
      }
    }
    return map;
  }, [classes]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = subjects.filter(
      (s) =>
        (!stage || (s.stage || "unassigned") === stage) &&
        (!term || s.name.toLowerCase().includes(term) || s.code.toLowerCase().includes(term))
    );
    const map = new Map<string, SubjectItem[]>();
    for (const s of visible) {
      const key = s.stage || "unassigned";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...STAGE_ORDER, "unassigned"]
      .filter((k) => map.has(k))
      .map((k) => ({ key: k, label: STAGE_LABEL[k] ?? k, items: map.get(k)! }));
  }, [subjects, stage, search]);

  return (
    <>
      <Hero
        title="Subjects"
        subtitle={`${subjects.length} subjects across ${classes.length} classes`}
        actionLabel="Add Subject"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <div className="accounting-toolbar">
        <input
          className="inp"
          placeholder="Search subject or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select
          className="inp"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
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
      </div>

      {!groups.length ? (
        <EmptyState message="No subjects match. Import the curriculum from Classes → Curriculum Library." />
      ) : (
        groups.map((group) => (
          <Panel key={group.key} title={group.label} meta={`${group.items.length} SUBJECTS`}>
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Code</th>
                    <th>Teacher</th>
                    <th className="right">Periods / Credits</th>
                    <th className="right">Classes</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((s) => {
                    const mapped = teachersFor(s._id);
                    return (
                      <tr key={s._id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td className="num">{s.code}</td>
                        <td>
                          {mapped.length ? (
                            <NameCell name={fullName(mapped[0])} />
                          ) : (
                            <span style={{ color: "var(--text-dim)" }}>Not assigned</span>
                          )}
                        </td>
                        <td className="num">{s.credits}</td>
                        <td className="num">{usage.get(s._id) ?? 0}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        ))
      )}

      <SubjectForm open={open} onClose={() => setOpen(false)} onSaved={load} initial={editing} />
    </>
  );
}
