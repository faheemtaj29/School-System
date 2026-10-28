"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Hero,
  MiniAvatar,
  NameCell,
  Panel,
  PortalAccessButton,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { TeacherForm } from "@/components/forms/PeopleForms";
import { ClassItem, StudentItem, SubjectItem, TeacherItem, fullName, idOf, prettyDate } from "@/lib/types";

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherItem | null>(null);
  const [profile, setProfile] = useState<TeacherItem | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [t, s, c, st] = await Promise.all([
      fetch("/api/teachers").then((r) => r.json()),
      fetch("/api/subjects").then((r) => r.json()),
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/students").then((r) => r.json()),
    ]);
    setTeachers(t.teachers || []);
    setSubjects(s.subjects || []);
    setClasses(c.classes || []);
    setStudents(st.students || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this staff member?")) return;
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
        title="Teachers & Staff"
        subtitle={`${teachers.length} staff member${teachers.length !== 1 ? "s" : ""} · Teaching faculty`}
        actionLabel="Add Staff"
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
                      <NameCell name={fullName(t)} sub={t.email} imageUrl={t.profilePhoto} />
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
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setProfile(t)}
                        >
                          Profile
                        </button>
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
                        <PortalAccessButton
                          kind="teacher"
                          id={t._id}
                          email={t.email}
                          name={fullName(t)}
                        />
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => remove(t._id)}
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

      <TeacherForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        subjects={subjects}
        classes={classes}
      />

      {profile ? (
        <TeacherProfile
          teacher={profile}
          classes={classes}
          subjects={subjects}
          students={students}
          onClose={() => setProfile(null)}
        />
      ) : null}
    </>
  );
}

function TeacherProfile({
  teacher,
  classes,
  subjects,
  students,
  onClose,
}: {
  teacher: TeacherItem;
  classes: ClassItem[];
  subjects: SubjectItem[];
  students: StudentItem[];
  onClose: () => void;
}) {
  const assignedClassIds = new Set((teacher.classes || []).map((item) => idOf(item as never)));
  const assignedClasses = classes.filter((item) => assignedClassIds.has(item._id));
  const assignedSubjectIds = new Set((teacher.subjects || []).map((item) => idOf(item as never)));
  const assignedSubjects = subjects.filter((item) => assignedSubjectIds.has(item._id));
  const assignedStudents = students.filter(
    (student) => student.status === "active" && assignedClassIds.has(idOf(student.classId as never))
  );
  const branchName = teacher.branchCode || "Not assigned";

  return (
    <div
      className="modal-backdrop teacher-profile-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="modal wide teacher-profile" role="dialog" aria-modal="true" aria-labelledby="teacher-profile-title">
        <header className="modal-head">
          <div>
            <h2 id="teacher-profile-title">Teacher Profile</h2>
            <div className="sub">Employment details, teaching assignments and students in assigned classes</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close teacher profile">✕</button>
        </header>
        <div className="modal-body teacher-profile-body">
          <div className="teacher-profile-banner">
            <MiniAvatar name={fullName(teacher)} imageUrl={teacher.profilePhoto} />
            <div className="teacher-profile-name">
              <h3>{fullName(teacher)}</h3>
              <p>{teacher.employeeId} · {branchName}</p>
            </div>
            <span className={`badge ${teacher.status === "active" ? "present" : "absent"}`}>
              {teacher.status}
            </span>
          </div>

          <section className="teacher-profile-section">
            <h3>Personal & employment information</h3>
            <div className="teacher-info-grid">
              <TeacherInfo label="Email" value={teacher.email} />
              <TeacherInfo label="Phone" value={teacher.phone} />
              <TeacherInfo label="Gender" value={teacher.gender} />
              <TeacherInfo label="Qualification" value={teacher.qualification} />
              <TeacherInfo label="Date of birth" value={teacher.dateOfBirth ? prettyDate(teacher.dateOfBirth) : undefined} />
              <TeacherInfo label="Joining date" value={teacher.joinDate ? prettyDate(teacher.joinDate) : undefined} />
              <TeacherInfo label="Campus" value={branchName} />
              <TeacherInfo label="Address" value={teacher.address} />
            </div>
          </section>

          <section className="teacher-profile-section">
            <h3>Assigned subjects <span>{assignedSubjects.length}</span></h3>
            {assignedSubjects.length ? (
              <div className="teacher-profile-tags">
                {assignedSubjects.map((subject) => (
                  <span key={subject._id}>{subject.name}{subject.code ? ` · ${subject.code}` : ""}</span>
                ))}
              </div>
            ) : <p className="teacher-profile-empty">No subjects assigned.</p>}
          </section>

          <section className="teacher-profile-section">
            <h3>Assigned classes <span>{assignedClasses.length}</span></h3>
            {assignedClasses.length ? (
              <div className="teacher-class-list">
                {assignedClasses.map((classItem) => {
                  const classStudents = assignedStudents.filter((student) => idOf(student.classId as never) === classItem._id);
                  return (
                    <article className="teacher-class-card" key={classItem._id}>
                      <div className="teacher-class-heading">
                        <strong>{classItem.name} — {classItem.section}</strong>
                        <span>{classStudents.length} student{classStudents.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="teacher-class-meta">
                        {classItem.academicYear}{classItem.room ? ` · Room ${classItem.room}` : ""}
                      </div>
                      {classItem.subjects?.length ? (
                        <div className="teacher-class-meta">
                          Class curriculum: {classItem.subjects.map((subject) => subject.name).join(", ")}
                        </div>
                      ) : null}
                      {classStudents.length ? (
                        <ul className="teacher-student-list">
                          {classStudents.map((student) => (
                            <li key={student._id}>
                              <span>{fullName(student)}</span>
                              <span>
                                {student.rollNumber ? `Roll ${student.rollNumber} · ` : ""}
                                {student.admissionNo}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="teacher-profile-empty">No students currently enrolled in this class.</p>}
                    </article>
                  );
                })}
              </div>
            ) : <p className="teacher-profile-empty">No classes assigned.</p>}
          </section>

        </div>
      </section>
    </div>
  );
}

function TeacherInfo({ label, value }: { label: string; value?: string }) {
  return (
    <div className="teacher-info-item">
      <span>{label}</span>
      <strong>{value || "Not provided"}</strong>
    </div>
  );
}
