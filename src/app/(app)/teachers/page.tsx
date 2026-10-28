"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Hero,
  NameCell,
  Panel,
  PortalAccessButton,
  RowMenu,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { TeacherForm } from "@/components/forms/PeopleForms";
import { ClassItem, SubjectItem, TeacherItem, fullName, photoSrc } from "@/lib/types";

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherItem | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [t, s, c] = await Promise.all([
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
    ]);
    setTeachers(t.teachers || []);
    setSubjects(s.subjects || []);
    setClasses(c.classes || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this teacher?")) return;
    await fetch(`/api/teachers/${id}`, { method: "DELETE" });
    load();
  }

  const visible = useMemo(() =>
    teachers.filter((t) =>
      (filter === "all" || t.status === filter) &&
      (!search || fullName(t).toLowerCase().includes(search.toLowerCase()) ||
       (t.employeeId && t.employeeId.toLowerCase().includes(search.toLowerCase())))
    ), [teachers, filter, search]);

  return (
    <>
      <Hero
        title="Teachers"
        subtitle={`${teachers.length} teacher${teachers.length !== 1 ? "s" : ""} · teaching faculty (clerks, accountants and other staff are under Campus Staff)`}
        actionLabel="Add Teacher"
        onAction={() => {
          setEditing(null);
          setOpen(true);
        }}
      />

      <div className="toolbar">
        <input
          type="search"
          className={inputClass}
          placeholder="Search by name or employee ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <div className="chips">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-chip${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All Staff" : f === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
      </div>

      {!visible.length ? (
        <EmptyState message="No staff found. Add subjects and classes first, then create staff." />
      ) : (
        <Panel title="Staff Directory" meta={`${visible.length} RECORDS`}>
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Employee ID</th>
                  <th>Subjects</th>
                  <th>Classes</th>
                  <th className="right">Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t._id}>
                    <td>
                      <NameCell
                        name={fullName(t)}
                        sub={[t.designation, t.phone || t.email].filter(Boolean).join(" · ")}
                        photo={photoSrc("teacher", t)}
                        href={`/teachers/${t._id}`}
                      />
                    </td>
                    <td className="num">{t.employeeId}</td>
                    <td>
                      {(t.subjects as SubjectItem[]).map((s) => s.code || s.name).join(", ") ||
                        "—"}
                    </td>
                    <td>
                      {(t.classes as ClassItem[])
                        .map((c) => `${c.name}-${c.section}`)
                        .join(", ") || "—"}
                    </td>
                    <td className="right">
                      <StatusBadge status={t.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link href={`/teachers/${t._id}`} className="link-btn">
                          Profile
                        </Link>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setEditing(t);
                            setOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <RowMenu>
                          <PortalAccessButton kind="teacher" id={t._id} email={t.email} name={fullName(t)} />
                          <button type="button" className="link-btn danger" onClick={() => remove(t._id)}>
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

      <TeacherForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        subjects={subjects}
        classes={classes}
      />
    </>
  );
}
