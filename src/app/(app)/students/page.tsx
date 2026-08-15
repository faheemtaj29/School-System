"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  Hero,
  NameCell,
  Panel,
  PortalAccessButton,
  StatusBadge,
} from "@/components/ui";
import { StudentForm } from "@/components/forms/PeopleForms";
import { ClassItem, StudentItem, fullName, labelOfClass } from "@/lib/types";

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StudentItem | null>(null);
  const [filterClass, setFilterClass] = useState("");
  const [filterBranch, setFilterBranch] = useState("");

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

  const activeClass = classes.find((c) => c._id === filterClass);

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

      <div className="toolbar">
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

      {!students.length ? (
        <EmptyState message="No students found. Create a class first, then enroll students." />
      ) : (
        <Panel
          title="Class Register"
          meta={
            activeClass
              ? `GRADE ${activeClass.name} — SECTION ${activeClass.section}`
              : "ALL CLASSES"
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
                  <th className="right">Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s._id}>
                    <td className="num">{s.rollNumber || "—"}</td>
                    <td>
                      <NameCell name={fullName(s)} sub={s.phone || undefined} />
                    </td>
                    <td>{s.parentName || "—"}</td>
                    <td>{labelOfClass(s.classId as never)}</td>
                    <td className="num">{s.admissionNo}</td>
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
    </>
  );
}
