"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, MiniAvatar, Panel, RowMenu } from "@/components/ui";
import { SubjectForm } from "@/components/forms/SchoolForms";
import {
  ClassItem,
  STAGE_LABEL,
  STAGE_ORDER,
  SubjectItem,
  TeacherItem,
  fullName,
  idOf,
  photoSrc,
} from "@/lib/types";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [stage, setStage] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SubjectItem | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

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
    if (!confirm("Delete this subject? It will be removed from every class and teacher.")) return;
    const res = await fetch(`/api/subjects/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    setNotice(res.ok ? { ok: true, text: "Subject deleted." } : { ok: false, text: d.error || "Could not delete" });
    load();
  }

  async function action(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/subjects/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) setNotice({ ok: false, text: d.error || "Could not save" });
    return res.ok ? d : null;
  }

  async function assignTeachers(subjectId: string, ids: string[]) {
    if (await action(subjectId, { action: "teachers", teacherIds: ids })) load();
  }

  async function merge(from: SubjectItem, into: SubjectItem) {
    if (!confirm(`Merge ${from.name} (${from.code}) into ${into.name} (${into.code})?\nIts classes and teachers move to ${into.code}, then ${from.code} is deleted.`)) return;
    const d = await action(from._id, { action: "merge", into: into._id });
    if (d) {
      setNotice({ ok: true, text: `Merged ${from.code} into ${into.code} — ${d.classes} class(es), ${d.teachers} teacher(s) moved.` });
      load();
    }
  }

  function teachersFor(subjectId: string) {
    return teachers.filter((t) =>
      (t.subjects as SubjectItem[]).some((s) => idOf(s as never) === subjectId)
    );
  }

  /** Subjects that share a name (case-insensitive) — usually an accidental duplicate. */
  const twins = useMemo(() => {
    const byName = new Map<string, SubjectItem[]>();
    for (const sub of subjects) {
      const key = sub.name.trim().toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), sub]);
    }
    return [...byName.values()].filter((list) => list.length > 1);
  }, [subjects]);
  const twinsOf = (sub: SubjectItem) =>
    twins.find((list) => list.some((x) => x._id === sub._id))?.filter((x) => x._id !== sub._id) ?? [];
  const unassigned = subjects.filter((sub) => !teachersFor(sub._id).length).length;

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
        subtitle={`${subjects.length} subjects across ${classes.length} classes${unassigned ? ` · ${unassigned} without a teacher` : ""}`}
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

      {notice ? <div className={`alert ${notice.ok ? "ok" : "err"}`}>{notice.text}</div> : null}
      {twins.length ? (
        <div className="alert warn">
          Possible duplicates:{" "}
          {twins.map((list) => `${list[0].name} (${list.map((x) => x.code).join(", ")})`).join(" · ")}. Use{" "}
          <b>More ▾ → Merge</b> on the one to remove; its classes and teachers move to the other.
        </div>
      ) : null}

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
                        <td>
                          <b>{s.name}</b>
                          {twinsOf(s).length ? <span className="badge warn" style={{ marginLeft: 8 }}>duplicate</span> : null}
                        </td>
                        <td className="num">{s.code}</td>
                        <td>
                          <div className="sub-teachers">
                            {mapped.map((t) => (
                              <span key={t._id} className="sub-teacher">
                                <MiniAvatar name={fullName(t)} photo={photoSrc("teacher", t)} />
                                {fullName(t)}
                                <button
                                  type="button"
                                  title="Remove"
                                  onClick={() => assignTeachers(s._id, mapped.filter((x) => x._id !== t._id).map((x) => x._id))}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {teachers.length > mapped.length ? (
                              <select
                                className="sub-assign"
                                value=""
                                onChange={(e) => e.target.value && assignTeachers(s._id, [...mapped.map((x) => x._id), e.target.value])}
                              >
                                <option value="">{mapped.length ? "+ Add" : "+ Assign teacher"}</option>
                                {teachers
                                  .filter((t) => !mapped.some((x) => x._id === t._id))
                                  .map((t) => (
                                    <option key={t._id} value={t._id}>
                                      {fullName(t)}
                                    </option>
                                  ))}
                              </select>
                            ) : !mapped.length ? (
                              <span style={{ color: "var(--text-dim)" }}>Add staff first</span>
                            ) : null}
                          </div>
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
                            <RowMenu>
                              {twinsOf(s).map((t) => (
                                <button key={t._id} type="button" className="link-btn" onClick={() => merge(s, t)}>
                                  Merge into {t.code}
                                </button>
                              ))}
                              <button type="button" className="link-btn danger" onClick={() => remove(s._id)}>
                                Delete
                              </button>
                            </RowMenu>
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
