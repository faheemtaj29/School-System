"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  ModalForm,
  NameCell,
  Panel,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import {
  StudentItem,
  TeacherItem,
  formatNumber,
  fullName,
  prettyDate,
  toDateInput,
} from "@/lib/types";

type RefCourse = { _id: string; code: string; title: string; fee?: number; level?: string; mode?: string };
type RefPerson = { _id: string; firstName: string; lastName: string; admissionNo?: string; employeeId?: string };

type Course = {
  _id: string;
  code: string;
  title: string;
  description?: string;
  mode: string;
  level: string;
  teacherId?: RefPerson | string | null;
  durationWeeks: number;
  fee: number;
  maxSeats: number;
  startDate?: string;
  endDate?: string;
  status: string;
  liveLink?: string;
};

type Lecture = {
  _id: string;
  courseId: RefCourse | string;
  title: string;
  type: "live" | "recorded";
  teacherId?: RefPerson | string | null;
  scheduledAt?: string;
  durationMin: number;
  meetingUrl?: string;
  recordingUrl?: string;
  notes?: string;
  status: string;
  order: number;
};

type Enrollment = {
  _id: string;
  courseId: RefCourse | string;
  studentId: RefPerson | string;
  status: string;
  progress: number;
  completedLectureIds?: string[];
  feePaid: number;
  enrolledAt?: string;
  notes?: string;
};

type Diploma = {
  _id: string;
  studentId: RefPerson | string;
  courseId: RefCourse | string;
  title: string;
  diplomaNo: string;
  issueDate: string;
  grade?: string;
  status: string;
};

type Tab = "courses" | "lectures" | "enrollments" | "diplomas";

const courseBlank = {
  code: "",
  title: "",
  description: "",
  mode: "online",
  level: "certificate",
  teacherId: "",
  durationWeeks: 8,
  fee: 0,
  maxSeats: 40,
  startDate: "",
  endDate: "",
  status: "open",
  liveLink: "",
};

const lectureBlank = {
  courseId: "",
  title: "",
  type: "live" as "live" | "recorded",
  teacherId: "",
  scheduledAt: "",
  durationMin: 45,
  meetingUrl: "",
  recordingUrl: "",
  notes: "",
  status: "scheduled",
  order: 1,
};

const enrollBlank = {
  courseId: "",
  studentId: "",
  status: "active",
  progress: 0,
  feePaid: 0,
  notes: "",
};

const diplomaBlank = {
  studentId: "",
  courseId: "",
  title: "",
  diplomaNo: "",
  issueDate: toDateInput(new Date()),
  grade: "",
  status: "issued",
  notes: "",
};

function idOf(v: { _id: string } | string | null | undefined) {
  if (!v) return "";
  return typeof v === "object" ? v._id : v;
}

function personLabel(v: RefPerson | string | null | undefined) {
  if (!v || typeof v === "string") return "—";
  return fullName(v);
}

function courseLabel(v: RefCourse | string | null | undefined) {
  if (!v || typeof v === "string") return "—";
  return `${v.code} · ${v.title}`;
}

export default function DistanceLearningPage() {
  const [tab, setTab] = useState<Tab>("courses");
  const [stats, setStats] = useState({ courses: 0, lectures: 0, enrollments: 0, diplomas: 0, liveNow: 0 });
  const [courses, setCourses] = useState<Course[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [diplomas, setDiplomas] = useState<Diploma[]>([]);
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState(courseBlank);
  const [lectureForm, setLectureForm] = useState(lectureBlank);
  const [enrollForm, setEnrollForm] = useState(enrollBlank);
  const [diplomaForm, setDiplomaForm] = useState(diplomaBlank);
  const [err, setErr] = useState("");
  const [role, setRole] = useState("admin");
  const [uploading, setUploading] = useState(false);
  const [watching, setWatching] = useState<Lecture | null>(null);
  const canManage = role === "admin" || role === "teacher";
  const isStudent = role === "student" || role === "parent";

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({}));
    const myRole = me.user?.role || "admin";
    setRole(myRole);
    const [c, l, e, d] = await Promise.all([
      fetch("/api/elearning?kind=course").then((r) => r.json()),
      fetch("/api/elearning?kind=lecture").then((r) => r.json()),
      fetch("/api/elearning?kind=enrollment").then((r) => r.json()),
      fetch("/api/elearning?kind=diploma").then((r) => r.json()),
    ]);
    setStats(c.stats || l.stats || { courses: 0, lectures: 0, enrollments: 0, diplomas: 0, liveNow: 0 });
    setCourses(c.courses || []);
    setLectures(l.lectures || []);
    setEnrollments(e.enrollments || []);
    setDiplomas(d.diplomas || []);
    if (myRole === "admin" || myRole === "teacher") {
      const [t, s] = await Promise.all([
        fetch("/api/teachers").then((r) => r.json()),
        fetch("/api/students").then((r) => r.json()),
      ]);
      setTeachers(t.teachers || []);
      setStudents(s.students || []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setErr("");
    setEditingCourse(null);
    if (tab === "courses") setCourseForm(courseBlank);
    if (tab === "lectures") {
      setLectureForm({
        ...lectureBlank,
        courseId: courses[0]?._id || "",
        teacherId: teachers[0]?._id || "",
      });
    }
    if (tab === "enrollments") {
      setEnrollForm({
        ...enrollBlank,
        courseId: courses[0]?._id || "",
        studentId: students[0]?._id || "",
      });
    }
    if (tab === "diplomas") {
      setDiplomaForm({
        ...diplomaBlank,
        courseId: courses[0]?._id || "",
        studentId: students[0]?._id || "",
        title: courses[0] ? `Diploma — ${courses[0].title}` : "",
        diplomaNo: `DL-${Date.now().toString().slice(-6)}`,
        issueDate: toDateInput(new Date()),
      });
    }
    setOpen(true);
  }

  function openEditCourse(c: Course) {
    setEditingCourse(c);
    setCourseForm({
      code: c.code,
      title: c.title,
      description: c.description || "",
      mode: c.mode,
      level: c.level,
      teacherId: idOf(c.teacherId),
      durationWeeks: c.durationWeeks,
      fee: c.fee,
      maxSeats: c.maxSeats,
      startDate: toDateInput(c.startDate),
      endDate: toDateInput(c.endDate),
      status: c.status,
      liveLink: c.liveLink || "",
    });
    setErr("");
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    let url = "/api/elearning";
    let method = "POST";
    let body: unknown = {};
    let kind = "course";

    if (tab === "courses") {
      kind = "course";
      body = courseForm;
      if (editingCourse) {
        url = `/api/elearning/${editingCourse._id}?kind=course`;
        method = "PUT";
      } else {
        url = "/api/elearning?kind=course";
      }
    } else if (tab === "lectures") {
      kind = "lecture";
      body = lectureForm;
      url = "/api/elearning?kind=lecture";
    } else if (tab === "enrollments") {
      kind = "enrollment";
      body = enrollForm;
      url = "/api/elearning?kind=enrollment";
    } else {
      kind = "diploma";
      body = diplomaForm;
      url = "/api/elearning?kind=diploma";
    }

    const res = await fetch(url.includes("kind=") ? url : `${url}?kind=${kind}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setOpen(false);
    setEditingCourse(null);
    load();
  }

  async function remove(kind: string, id: string, label: string) {
    if (!confirm(`Delete this ${label}?`)) return;
    await fetch(`/api/elearning/${id}?kind=${kind}`, { method: "DELETE" });
    load();
  }

  async function setLectureStatus(lec: Lecture, status: string) {
    const courseId = idOf(lec.courseId);
    const scheduled =
      lec.scheduledAt && !Number.isNaN(new Date(lec.scheduledAt).getTime())
        ? new Date(lec.scheduledAt).toISOString()
        : "";
    await fetch(`/api/elearning/${lec._id}?kind=lecture`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId,
        title: lec.title,
        type: lec.type,
        teacherId: idOf(lec.teacherId),
        scheduledAt: scheduled,
        durationMin: lec.durationMin,
        meetingUrl: lec.meetingUrl || "",
        recordingUrl: lec.recordingUrl || "",
        notes: lec.notes || "",
        status,
        order: lec.order,
      }),
    });
    load();
  }

  async function bumpProgress(en: Enrollment, progress: number) {
    await fetch(`/api/elearning/${en._id}?kind=enrollment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: idOf(en.courseId),
        studentId: idOf(en.studentId),
        status: progress >= 100 ? "completed" : en.status,
        progress,
        feePaid: en.feePaid,
        notes: en.notes || "",
      }),
    });
    load();
  }

  function enrollmentForLecture(lecture: Lecture) {
    const courseId = idOf(lecture.courseId);
    return enrollments.find((item) => idOf(item.courseId) === courseId);
  }

  function trackableLectures(courseId: string) {
    return lectures.filter(
      (lecture) =>
        idOf(lecture.courseId) === courseId &&
        ((lecture.type === "recorded" && Boolean(lecture.recordingUrl)) ||
          (lecture.type === "live" && lecture.status === "completed"))
    );
  }

  async function markLecture(lecture: Lecture, completed: boolean) {
    const enrollment = enrollmentForLecture(lecture);
    if (!enrollment) {
      setErr("This lecture is not linked to one of your enrollments.");
      return;
    }
    const res = await fetch(`/api/elearning/${enrollment._id}?kind=enrollment`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "markLecture",
        lectureId: lecture._id,
        completed,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Could not update lecture progress");
      return;
    }
    await load();
  }

  const actionLabel =
    tab === "courses"
      ? "New Course"
      : tab === "lectures"
        ? "Add Lecture"
        : tab === "enrollments"
          ? "Enroll Student"
          : "Issue Diploma";

  async function uploadRecording(file: File) {
    setUploading(true);
    setErr("");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/uploads/lecture", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Upload failed");
        return;
      }
      setLectureForm((f) => ({ ...f, recordingUrl: data.url, type: "recorded" }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <Hero
        title="Distance Learning"
        subtitle={
          isStudent
            ? "Your enrolled courses, live classes and recorded lectures"
            : role === "teacher"
              ? "Your courses — schedule live sessions and upload recorded lectures"
              : "Online classes, live & recorded lectures, enrollments and diplomas"
        }
        actionLabel={canManage ? actionLabel : undefined}
        onAction={canManage ? openCreate : undefined}
      />

      <div className="pay-stat-row">
        <div className="pay-stat">
          <div className="tag">Courses</div>
          <div className="num">{stats.courses}</div>
        </div>
        <div className="pay-stat">
          <div className="tag">Lectures</div>
          <div className="num">{stats.lectures}</div>
        </div>
        <div className="pay-stat">
          <div className="tag">Active Enrollments</div>
          <div className="num">{stats.enrollments}</div>
        </div>
        <div className="pay-stat">
          <div className="tag">Live Now</div>
          <div className="num" style={{ color: "var(--red)" }}>{stats.liveNow}</div>
        </div>
        <div className="pay-stat">
          <div className="tag">Diplomas Issued</div>
          <div className="num" style={{ color: "var(--jade-dark)" }}>{stats.diplomas}</div>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["courses", "Courses"],
            ["lectures", "Live & Recorded"],
            ["enrollments", "Enrollments"],
            ["diplomas", "Diplomas"],
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

      {tab === "courses" ? (
        <Panel title="Online / Distance Courses" meta={`${courses.length} PROGRAMS`}>
          {!courses.length ? (
            <EmptyState message="No distance courses yet. Create a certificate, diploma or short course." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Course</th>
                    <th>Mode</th>
                    <th>Level</th>
                    <th>Teacher</th>
                    <th className="right">Fee</th>
                    <th className="right">Seats</th>
                    <th className="right">Status</th>
                    {canManage ? <th className="right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c) => (
                    <tr key={c._id}>
                      <td className="num">{c.code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {c.durationWeeks} weeks
                          {c.liveLink ? (
                            <>
                              {" · "}
                              <a href={c.liveLink} target="_blank" rel="noreferrer">
                                Classroom link
                              </a>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ textTransform: "capitalize" }}>{c.mode}</td>
                      <td style={{ textTransform: "capitalize" }}>{c.level}</td>
                      <td>
                        <NameCell name={personLabel(c.teacherId as RefPerson)} />
                      </td>
                      <td className="num">{formatNumber(c.fee)}</td>
                      <td className="num">{c.maxSeats}</td>
                      <td className="right">
                        <StatusBadge
                          status={
                            c.status === "open" || c.status === "ongoing"
                              ? "active"
                              : c.status === "draft"
                                ? "pending"
                                : "overdue"
                          }
                        />
                      </td>
                      {canManage ? (
                        <td>
                          <div className="row-actions">
                            <button type="button" className="link-btn" onClick={() => openEditCourse(c)}>
                              Edit
                            </button>
                            {role === "admin" ? (
                              <button
                                type="button"
                                className="link-btn danger"
                                onClick={() => remove("course", c._id, "course")}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "lectures" ? (
        <Panel title="Live Classes & Recorded Lectures" meta={`${lectures.length} SESSIONS`}>
          {isStudent && watching?.recordingUrl ? (
            <div className="lecture-player">
              <div>
                <strong>{watching.title}</strong>
                <div className="sub">{courseLabel(watching.courseId)}</div>
              </div>
              {watching.recordingUrl.startsWith("/uploads/") ||
              /\.(mp4|webm|mov|mp3|m4a|wav)(\?.*)?$/i.test(watching.recordingUrl) ? (
                <video
                  src={watching.recordingUrl}
                  controls
                  preload="metadata"
                  onEnded={() => markLecture(watching, true)}
                />
              ) : (
                <a
                  className="btn-dark"
                  href={watching.recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open recording
                </a>
              )}
              <button type="button" className="link-btn" onClick={() => setWatching(null)}>
                Close player
              </button>
            </div>
          ) : null}
          {err && isStudent ? <div className="alert err">{err}</div> : null}
          {!lectures.length ? (
            <EmptyState
              message={
                canManage
                  ? "No lectures yet. Schedule a live class or upload a recording."
                  : "No lectures for your courses yet."
              }
            />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Lecture</th>
                    <th>Course</th>
                    <th>Type</th>
                    <th>When</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lectures.map((lec) => (
                    <tr key={lec._id}>
                      <td className="num">{lec.order}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{lec.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {lec.durationMin} min · {personLabel(lec.teacherId as RefPerson)}
                          {lec.type === "live" && lec.meetingUrl ? (
                            <>
                              {" · "}
                              <a href={lec.meetingUrl} target="_blank" rel="noreferrer">
                                Join live
                              </a>
                            </>
                          ) : null}
                          {lec.type === "recorded" && lec.recordingUrl ? (
                            <>
                              {" · "}
                              <a href={lec.recordingUrl} target="_blank" rel="noreferrer">
                                Watch recording
                              </a>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td>{courseLabel(lec.courseId as RefCourse)}</td>
                      <td style={{ textTransform: "capitalize" }}>{lec.type}</td>
                      <td className="num">{prettyDate(lec.scheduledAt)}</td>
                      <td className="right">
                        <StatusBadge
                          status={
                            lec.status === "live"
                              ? "overdue"
                              : lec.status === "completed"
                                ? "paid"
                                : lec.status === "cancelled"
                                  ? "overdue"
                                  : "pending"
                          }
                        />
                      </td>
                      <td>
                        <div className="row-actions">
                          {canManage && lec.type === "live" && lec.status === "scheduled" ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setLectureStatus(lec, "live")}
                            >
                              Go live
                            </button>
                          ) : null}
                          {canManage && lec.status === "live" ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setLectureStatus(lec, "completed")}
                            >
                              End
                            </button>
                          ) : null}
                          {canManage ? (
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => remove("lecture", lec._id, "lecture")}
                            >
                              Delete
                            </button>
                          ) : lec.type === "recorded" && lec.recordingUrl ? (
                            <>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => setWatching(lec)}
                              >
                                Watch
                              </button>
                              {enrollmentForLecture(lec)?.completedLectureIds?.some(
                                (id) => String(id) === lec._id
                              ) ? (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => markLecture(lec, false)}
                                >
                                  ✓ Completed
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => markLecture(lec, true)}
                                >
                                  Mark complete
                                </button>
                              )}
                            </>
                          ) : lec.type === "live" &&
                            lec.status !== "completed" &&
                            lec.meetingUrl ? (
                            <a className="link-btn" href={lec.meetingUrl} target="_blank" rel="noreferrer">
                              Join
                            </a>
                          ) : isStudent && lec.type === "live" && lec.status === "completed" ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() =>
                                markLecture(
                                  lec,
                                  !enrollmentForLecture(lec)?.completedLectureIds?.some(
                                    (id) => String(id) === lec._id
                                  )
                                )
                              }
                            >
                              {enrollmentForLecture(lec)?.completedLectureIds?.some(
                                (id) => String(id) === lec._id
                              )
                                ? "✓ Attended"
                                : "Mark attended"}
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "enrollments" ? (
        <Panel
          title={isStudent ? "My Enrollments" : "Student Enrollments"}
          meta={`${enrollments.length} RECORDS`}
        >
          {!enrollments.length ? (
            <EmptyState
              message={
                isStudent ? "You are not enrolled in any distance course yet." : "No distance learners enrolled yet."
              }
            />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    {!isStudent ? <th>Student</th> : null}
                    <th>Course</th>
                    <th className="right">Progress</th>
                    <th className="right">Fee Paid</th>
                    <th className="right">Status</th>
                    {role === "admin" ? <th className="right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {enrollments.map((en) => {
                    const st = typeof en.studentId === "object" ? en.studentId : null;
                    return (
                      <tr key={en._id}>
                        {!isStudent ? (
                          <td>
                            <NameCell
                              name={st ? fullName(st) : "—"}
                              sub={st?.admissionNo || ""}
                            />
                          </td>
                        ) : null}
                        <td>{courseLabel(en.courseId as RefCourse)}</td>
                        <td className="num">
                          <div style={{ minWidth: 110 }}>
                            <div style={{ marginBottom: 5 }}>
                              {en.progress}% · {en.completedLectureIds?.length || 0}/
                              {trackableLectures(idOf(en.courseId)).length}{" "}
                              lectures
                            </div>
                            <div className="progress">
                              <i style={{ width: `${en.progress}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="num">{formatNumber(en.feePaid)}</td>
                        <td className="right">
                          <StatusBadge
                            status={
                              en.status === "active" || en.status === "completed"
                                ? "active"
                                : en.status === "pending"
                                  ? "pending"
                                  : "overdue"
                            }
                          />
                        </td>
                        {role === "admin" ? (
                          <td>
                            <div className="row-actions">
                              {en.progress < 100 ? (
                                <button
                                  type="button"
                                  className="link-btn"
                                  onClick={() => bumpProgress(en, Math.min(100, en.progress + 25))}
                                >
                                  +25%
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="link-btn danger"
                                onClick={() => remove("enrollment", en._id, "enrollment")}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "diplomas" ? (
        <Panel
          title={isStudent ? "My Certificates" : "Certificates & Diplomas"}
          meta={`${diplomas.length} ISSUED`}
        >
          {!diplomas.length ? (
            <EmptyState
              message={
                isStudent
                  ? "No certificates issued to you yet."
                  : "No diplomas issued yet. Complete a course enrollment first."
              }
            />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Diploma No</th>
                    {!isStudent ? <th>Student</th> : null}
                    <th>Program</th>
                    <th>Grade</th>
                    <th>Issued</th>
                    {role === "admin" ? <th className="right">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {diplomas.map((dip) => (
                    <tr key={dip._id}>
                      <td className="num">{dip.diplomaNo}</td>
                      {!isStudent ? (
                        <td>
                          <NameCell name={personLabel(dip.studentId as RefPerson)} />
                        </td>
                      ) : null}
                      <td>
                        <div style={{ fontWeight: 600 }}>{dip.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                          {courseLabel(dip.courseId as RefCourse)}
                        </div>
                      </td>
                      <td>{dip.grade || "—"}</td>
                      <td className="num">{prettyDate(dip.issueDate)}</td>
                      {role === "admin" ? (
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="link-btn danger"
                              onClick={() => remove("diploma", dip._id, "diploma")}
                            >
                              Revoke
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      <ModalForm
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingCourse(null);
        }}
        onSubmit={onSubmit}
        title={
          tab === "courses"
            ? editingCourse
              ? "Edit Course"
              : "New Distance Course"
            : tab === "lectures"
              ? "Add Live / Recorded Lecture"
              : tab === "enrollments"
                ? "Enroll Distance Learner"
                : "Issue Diploma / Certificate"
        }
        submitLabel={
          tab === "courses"
            ? editingCourse
              ? "Update"
              : "Create Course"
            : tab === "lectures"
              ? "Save Lecture"
              : tab === "enrollments"
                ? "Enroll"
                : "Issue"
        }
        wide
      >
        {err ? <div className="alert err">{err}</div> : null}

        {tab === "courses" ? (
          <>
            <div className="form-grid">
              <Field label="Code" required>
                <input
                  className={inputClass}
                  value={courseForm.code}
                  onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })}
                  required
                />
              </Field>
              <Field label="Title" required>
                <input
                  className={inputClass}
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  required
                />
              </Field>
              <Field label="Mode">
                <select
                  className={inputClass}
                  value={courseForm.mode}
                  onChange={(e) => setCourseForm({ ...courseForm, mode: e.target.value })}
                >
                  <option value="online">Online</option>
                  <option value="distance">Distance</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </Field>
              <Field label="Level">
                <select
                  className={inputClass}
                  value={courseForm.level}
                  onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })}
                >
                  <option value="certificate">Certificate</option>
                  <option value="diploma">Diploma</option>
                  <option value="short">Short Course</option>
                  <option value="degree">Degree</option>
                </select>
              </Field>
              <Field label="Teacher">
                <select
                  className={inputClass}
                  value={courseForm.teacherId}
                  onChange={(e) => setCourseForm({ ...courseForm, teacherId: e.target.value })}
                >
                  <option value="">— Assign later —</option>
                  {teachers.map((t) => (
                    <option key={t._id} value={t._id}>
                      {fullName(t)} ({t.employeeId})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  className={inputClass}
                  value={courseForm.status}
                  onChange={(e) => setCourseForm({ ...courseForm, status: e.target.value })}
                >
                  <option value="draft">Draft</option>
                  <option value="open">Open for enrollment</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="closed">Closed</option>
                </select>
              </Field>
              <Field label="Duration (weeks)">
                <input
                  type="number"
                  className={inputClass}
                  value={courseForm.durationWeeks}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, durationWeeks: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Fee">
                <input
                  type="number"
                  className={inputClass}
                  value={courseForm.fee}
                  onChange={(e) => setCourseForm({ ...courseForm, fee: Number(e.target.value) })}
                />
              </Field>
              <Field label="Max seats">
                <input
                  type="number"
                  className={inputClass}
                  value={courseForm.maxSeats}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, maxSeats: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  className={inputClass}
                  value={courseForm.startDate}
                  onChange={(e) => setCourseForm({ ...courseForm, startDate: e.target.value })}
                />
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  className={inputClass}
                  value={courseForm.endDate}
                  onChange={(e) => setCourseForm({ ...courseForm, endDate: e.target.value })}
                />
              </Field>
              <Field label="Default live classroom link">
                <input
                  className={inputClass}
                  placeholder="https://meet.google.com/..."
                  value={courseForm.liveLink}
                  onChange={(e) => setCourseForm({ ...courseForm, liveLink: e.target.value })}
                />
              </Field>
            </div>
            <div className="form-grid one" style={{ marginTop: 14 }}>
              <Field label="Description">
                <textarea
                  className={inputClass}
                  rows={3}
                  value={courseForm.description}
                  onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                />
              </Field>
            </div>
          </>
        ) : null}

        {tab === "lectures" ? (
          <div className="form-grid">
            <Field label="Course" required>
              <select
                className={inputClass}
                value={lectureForm.courseId}
                onChange={(e) => setLectureForm({ ...lectureForm, courseId: e.target.value })}
                required
              >
                <option value="">Select course</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" required>
              <input
                className={inputClass}
                value={lectureForm.title}
                onChange={(e) => setLectureForm({ ...lectureForm, title: e.target.value })}
                required
              />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={lectureForm.type}
                onChange={(e) =>
                  setLectureForm({
                    ...lectureForm,
                    type: e.target.value as "live" | "recorded",
                  })
                }
              >
                <option value="live">Live class (teacher online)</option>
                <option value="recorded">Recorded lecture</option>
              </select>
            </Field>
            <Field label="Teacher">
              <select
                className={inputClass}
                value={lectureForm.teacherId}
                onChange={(e) => setLectureForm({ ...lectureForm, teacherId: e.target.value })}
              >
                <option value="">—</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {fullName(t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scheduled at">
              <input
                type="datetime-local"
                className={inputClass}
                value={lectureForm.scheduledAt}
                onChange={(e) => setLectureForm({ ...lectureForm, scheduledAt: e.target.value })}
              />
            </Field>
            <Field label="Duration (min)">
              <input
                type="number"
                className={inputClass}
                value={lectureForm.durationMin}
                onChange={(e) =>
                  setLectureForm({ ...lectureForm, durationMin: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Order">
              <input
                type="number"
                className={inputClass}
                value={lectureForm.order}
                onChange={(e) => setLectureForm({ ...lectureForm, order: Number(e.target.value) })}
              />
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={lectureForm.status}
                onChange={(e) => setLectureForm({ ...lectureForm, status: e.target.value })}
              >
                <option value="scheduled">Scheduled</option>
                <option value="live">Live now</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            {lectureForm.type === "live" ? (
              <Field label="Meeting URL (Zoom / Meet / Teams)">
                <input
                  className={inputClass}
                  value={lectureForm.meetingUrl}
                  onChange={(e) => setLectureForm({ ...lectureForm, meetingUrl: e.target.value })}
                />
              </Field>
            ) : (
              <>
                <Field label="Upload recording (mp4 / webm / mp3)">
                  <input
                    className={inputClass}
                    type="file"
                    accept="video/*,audio/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadRecording(file);
                    }}
                  />
                  {uploading ? (
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                      Uploading…
                    </div>
                  ) : null}
                </Field>
                <Field label="Or paste recording URL (YouTube / Vimeo / file)">
                  <input
                    className={inputClass}
                    value={lectureForm.recordingUrl}
                    onChange={(e) =>
                      setLectureForm({ ...lectureForm, recordingUrl: e.target.value })
                    }
                    placeholder="/uploads/lectures/… or https://…"
                  />
                </Field>
              </>
            )}
            <Field label="Notes">
              <input
                className={inputClass}
                value={lectureForm.notes}
                onChange={(e) => setLectureForm({ ...lectureForm, notes: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {tab === "enrollments" ? (
          <div className="form-grid">
            <Field label="Course" required>
              <select
                className={inputClass}
                value={enrollForm.courseId}
                onChange={(e) => setEnrollForm({ ...enrollForm, courseId: e.target.value })}
                required
              >
                <option value="">Select course</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.code} — {c.title} (PKR {formatNumber(c.fee)})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Student" required>
              <select
                className={inputClass}
                value={enrollForm.studentId}
                onChange={(e) => setEnrollForm({ ...enrollForm, studentId: e.target.value })}
                required
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {fullName(s)} ({s.admissionNo})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={enrollForm.status}
                onChange={(e) => setEnrollForm({ ...enrollForm, status: e.target.value })}
              >
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="dropped">Dropped</option>
              </select>
            </Field>
            <Field label="Fee paid">
              <input
                type="number"
                className={inputClass}
                value={enrollForm.feePaid}
                onChange={(e) => setEnrollForm({ ...enrollForm, feePaid: Number(e.target.value) })}
              />
            </Field>
            <Field label="Progress %">
              <input
                type="number"
                className={inputClass}
                value={enrollForm.progress}
                onChange={(e) => setEnrollForm({ ...enrollForm, progress: Number(e.target.value) })}
              />
            </Field>
            <Field label="Notes">
              <input
                className={inputClass}
                value={enrollForm.notes}
                onChange={(e) => setEnrollForm({ ...enrollForm, notes: e.target.value })}
              />
            </Field>
          </div>
        ) : null}

        {tab === "diplomas" ? (
          <div className="form-grid">
            <Field label="Student" required>
              <select
                className={inputClass}
                value={diplomaForm.studentId}
                onChange={(e) => setDiplomaForm({ ...diplomaForm, studentId: e.target.value })}
                required
              >
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {fullName(s)} ({s.admissionNo})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Course" required>
              <select
                className={inputClass}
                value={diplomaForm.courseId}
                onChange={(e) => {
                  const c = courses.find((x) => x._id === e.target.value);
                  setDiplomaForm({
                    ...diplomaForm,
                    courseId: e.target.value,
                    title: c ? `Diploma — ${c.title}` : diplomaForm.title,
                  });
                }}
                required
              >
                <option value="">Select course</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Certificate / Diploma title" required>
              <input
                className={inputClass}
                value={diplomaForm.title}
                onChange={(e) => setDiplomaForm({ ...diplomaForm, title: e.target.value })}
                required
              />
            </Field>
            <Field label="Diploma No" required>
              <input
                className={inputClass}
                value={diplomaForm.diplomaNo}
                onChange={(e) => setDiplomaForm({ ...diplomaForm, diplomaNo: e.target.value })}
                required
              />
            </Field>
            <Field label="Issue date">
              <input
                type="date"
                className={inputClass}
                value={diplomaForm.issueDate}
                onChange={(e) => setDiplomaForm({ ...diplomaForm, issueDate: e.target.value })}
              />
            </Field>
            <Field label="Grade">
              <input
                className={inputClass}
                placeholder="A / Distinction / Pass"
                value={diplomaForm.grade}
                onChange={(e) => setDiplomaForm({ ...diplomaForm, grade: e.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </ModalForm>
    </>
  );
}
