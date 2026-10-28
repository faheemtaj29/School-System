"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, Field, Hero, NameCell, Panel, inputClass } from "@/components/ui";
import {
  AttendanceItem,
  ClassItem,
  StudentItem,
  activeBranch,
  fullName,
  labelOfClass,
  prettyDate,
  toDateInput,
} from "@/lib/types";

type Status = "present" | "absent" | "late" | "excused";
type RecordRow = { studentId: string; status: Status | "unmarked"; note?: string };
type AttendanceOverview = {
  role: "admin" | "teacher";
  date: string;
  branchCode: string;
  totals: {
    enrolled: number;
    pending: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    pendingClasses: number;
    classes: number;
  };
  classes: {
    _id: string;
    name: string;
    section: string;
    branchCode: string;
    enrolled: number;
    marked: number;
    pending: number;
    status: "pending" | "incomplete" | "saved" | "no-students";
    counts: { present: number; absent: number; late: number; excused: number };
  }[];
  sheets: (AttendanceItem & { teacherName?: string })[];
};

const options: { value: Status; short: string; label: string; cls: string }[] = [
  { value: "present", short: "P", label: "Present", cls: "p" },
  { value: "absent", short: "A", label: "Absent", cls: "a" },
  { value: "late", short: "L", label: "Late", cls: "l" },
  { value: "excused", short: "E", label: "Leave", cls: "e" },
];

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [history, setHistory] = useState<AttendanceItem[]>([]);
  const [overview, setOverview] = useState<AttendanceOverview | null>(null);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [search, setSearch] = useState("");
  const [historyClassId, setHistoryClassId] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoUploadingId, setPhotoUploadingId] = useState("");
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const appliedRequestedClass = useRef(false);
  const rollCallRef = useRef<HTMLFormElement>(null);

  const loadMeta = useCallback(async () => {
    setError("");
    setLoadingOverview(true);
    try {
      const branchCode = activeBranch();
      const [classRes, attendanceRes, overviewRes] = await Promise.all([
        fetch("/api/classes"),
        fetch("/api/attendance"),
        fetch(`/api/attendance?overview=true&date=${encodeURIComponent(date)}&branchCode=${encodeURIComponent(branchCode)}`),
      ]);
      const [c, a, overviewData] = await Promise.all([
        classRes.json(),
        attendanceRes.json(),
        overviewRes.json(),
      ]);
      if (!classRes.ok || !attendanceRes.ok || !overviewRes.ok) {
        throw new Error(
          c.error || a.error || overviewData.error || "Could not load attendance data"
        );
      }
      const overviewResult: AttendanceOverview | null = overviewData.overview || null;
      const allowedClassIds = new Set(
        overviewResult?.classes.map((item) => item._id) || []
      );
      const assignedClasses: ClassItem[] = (c.classes || []).filter(
        (item: ClassItem) => !overviewResult || allowedClassIds.has(item._id)
      );
      setClasses(assignedClasses);
      setHistory((a.attendance || []).filter((sheet: AttendanceItem) => {
        const id = typeof sheet.classId === "string" ? sheet.classId : sheet.classId._id;
        return !overviewResult || allowedClassIds.has(id);
      }));
      setOverview(overviewResult);
      if (classId && !assignedClasses.some((item) => item._id === classId)) {
        setClassId("");
      }
      if (!appliedRequestedClass.current) {
        const requestedClass = new URLSearchParams(window.location.search).get("classId");
        if (requestedClass && assignedClasses.some((item) => item._id === requestedClass)) {
          setClassId(requestedClass);
        }
        appliedRequestedClass.current = true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load attendance data");
      setOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  }, [classId, date]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      setRecords([]);
      return;
    }
    let cancelled = false;
    setLoadingRoster(true);
    setError("");
    setMessage("");
    Promise.all([
      fetch(`/api/students?classId=${encodeURIComponent(classId)}&activeOnly=true`).then(async (r) => ({ ok: r.ok, data: await r.json() })),
      fetch(`/api/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`).then(async (r) => ({ ok: r.ok, data: await r.json() })),
    ])
      .then(([studentRes, attendanceRes]) => {
        if (!studentRes.ok || !attendanceRes.ok) {
          throw new Error(studentRes.data.error || attendanceRes.data.error || "Could not load this class roster");
        }
        if (cancelled) return;
        const list: StudentItem[] = studentRes.data.students || [];
        const saved = (attendanceRes.data.attendance || [])[0] as AttendanceItem | undefined;
        const savedByStudent = new Map(
          (saved?.records || []).map((record) => [
            typeof record.studentId === "string" ? record.studentId : record.studentId._id,
            record,
          ])
        );
        setStudents(list);
        setRecords(list.map((student) => {
          const existing = savedByStudent.get(student._id);
          return {
            studentId: student._id,
            status: existing?.status || "unmarked",
            note: existing?.note || "",
          };
        }));
        if (saved) setMessage("Saved attendance loaded. Review or correct the records before saving.");
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this class roster");
      })
      .finally(() => {
        if (!cancelled) setLoadingRoster(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, date]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (records.some((record) => record.status === "unmarked")) {
      setError("Mark every student before saving attendance.");
      return;
    }
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, date, records }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save attendance");
        return;
      }
      setMessage("Attendance saved successfully. The saved sheet is now available in Recent Sheets.");
      loadMeta();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  async function updateStudentPhoto(studentId: string, file?: File) {
    if (!file) return;
    const student = students.find((item) => item._id === studentId);
    if (!student) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP student photo.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Student photo must be 5 MB or smaller.");
      return;
    }

    setError("");
    setPhotoUploadingId(studentId);
    try {
      const uploadBody = new FormData();
      uploadBody.append("file", file);
      const uploadResponse = await fetch("/api/uploads/profile", {
        method: "POST",
        body: uploadBody,
      });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok) {
        throw new Error(uploaded.error || "Could not upload student photo.");
      }

      const saveResponse = await fetch(`/api/students/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profilePhoto: uploaded.url }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) {
        throw new Error(saved.error || "Photo uploaded but could not be saved to the student profile.");
      }

      setStudents((current) =>
        current.map((item) =>
          item._id === studentId
            ? { ...item, profilePhoto: saved.student?.profilePhoto || uploaded.url }
            : item
        )
      );
      setMessage(`Profile photo saved for ${fullName(student)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save student photo.");
    } finally {
      setPhotoUploadingId("");
    }
  }

  function markAll(status: Status) {
    setRecords((prev) => prev.map((r) => ({ ...r, status })));
  }

  const selectedClass = classes.find((c) => c._id === classId);
  const presentCount = records.filter((r) => r.status === "present").length;
  const statusCounts = records.reduce<Record<Status | "unmarked", number>>(
    (counts, record) => {
      counts[record.status] += 1;
      return counts;
    },
    { present: 0, absent: 0, late: 0, excused: 0, unmarked: 0 }
  );
  const filteredStudents = students.filter((student) =>
    `${fullName(student)} ${student.rollNumber || ""} ${student.admissionNo}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );
  const filteredRecords = records.filter((record) => {
    const student = students.find((item) => item._id === record.studentId);
    return student && filteredStudents.some((item) => item._id === student._id);
  });
  const visibleHistory = history.filter((sheet) => {
    const sheetClassId = typeof sheet.classId === "string" ? sheet.classId : sheet.classId._id;
    return !historyClassId || sheetClassId === historyClassId;
  });
  const classesForAttendance = overview?.classes.filter((item) => item.enrolled > 0) || [];
  const classesWithoutRoster = Math.max(
    (overview?.classes.length || 0) - classesForAttendance.length,
    0
  );

  return (
    <>
      <Hero
        title="Attendance"
        subtitle={`Daily register · ${prettyDate(date)}${overview?.branchCode ? ` · ${overview.branchCode}` : ""}${selectedClass ? ` · ${selectedClass.name}-${selectedClass.section}` : ""}`}
      />

      <section className="attendance-dashboard" aria-label="Attendance overview">
        <div className="attendance-dashboard-heading">
          <div>
            <span className="attendance-eyebrow">
              {overview?.role === "admin" ? "SCHOOL OVERVIEW" : "MY CLASSES"}
            </span>
            <h2>{overview?.role === "admin" ? "Daily attendance" : "Your attendance workspace"}</h2>
            <p>Live summary for {prettyDate(date)}. Unmarked students are not counted as absent.</p>
          </div>
          <label className="attendance-date-filter">
            <span>Attendance date</span>
            <input
              aria-label="Attendance date"
              type="date"
              className={inputClass}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
        </div>

        <div className="attendance-kpis">
          <div className="attendance-kpi enrolled">
            <span>{overview?.role === "admin" ? "Enrolled students" : "Assigned classes"}</span>
            <b>{loadingOverview ? "—" : overview?.role === "admin" ? overview.totals.enrolled : overview?.totals.classes ?? 0}</b>
            <small>{overview?.role === "admin" ? "Active student records" : "Authorized class groups"}</small>
          </div>
          <div className="attendance-kpi present">
            <span>Present today</span>
            <b>{loadingOverview ? "—" : overview?.totals.present ?? 0}</b>
            <small>Saved attendance records</small>
          </div>
          <div className="attendance-kpi absent">
            <span>Absent today</span>
            <b>{loadingOverview ? "—" : overview?.totals.absent ?? 0}</b>
            <small>Recorded as absent</small>
          </div>
          <div className="attendance-kpi pending">
            <span>{overview?.role === "teacher" ? "Sheets pending" : "Classes pending"}</span>
            <b>{loadingOverview ? "—" : overview?.totals.pendingClasses ?? 0}</b>
            <small>{overview?.totals.pending ?? 0} students unmarked</small>
          </div>
        </div>

        <Panel
          title={overview?.role === "admin" ? "Class submission status" : "Today's assigned classes"}
          meta={`${classesForAttendance.length} ACTIVE CLASSES`}
        >
          {loadingOverview ? (
            <div role="status" className="attendance-loading">Loading attendance summary...</div>
          ) : !classesForAttendance.length ? (
            <EmptyState message="No classes are available for this account and branch." />
          ) : (
            <div className="attendance-class-grid">
              {classesForAttendance.map((item) => {
                const selected = item._id === classId;
                const completion = item.enrolled
                  ? Math.min(100, Math.round((item.marked / item.enrolled) * 100))
                  : 0;
                return (
                  <button
                    type="button"
                    key={item._id}
                    className={`attendance-class-card${selected ? " selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setClassId(item._id);
                      window.requestAnimationFrame(() => {
                        rollCallRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      });
                    }}
                  >
                    <span className={`attendance-class-status ${item.status}`}>
                        {item.status === "saved" ? "Saved" : item.status === "incomplete" ? "Incomplete" : item.status === "no-students" ? "No roster" : "Pending"}
                    </span>
                    <strong>{item.name} · {item.section}</strong>
                    <span>{item.marked} / {item.enrolled} students marked</span>
                    <i><b style={{ width: `${completion}%` }} /></i>
                    <span className="attendance-class-foot">
                      Present {item.counts.present} · Absent {item.counts.absent} · Leave {item.counts.excused} · Late {item.counts.late}
                    </span>
                    <span className="attendance-class-action">
                      {item.status === "no-students" ? "No active students" : selected ? "Selected" : "Mark attendance →"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {!loadingOverview && classesWithoutRoster > 0 ? (
            <p className="attendance-no-roster-note">
              {classesWithoutRoster} class{classesWithoutRoster === 1 ? "" : "es"} with no active students are excluded from expected attendance.
            </p>
          ) : null}
        </Panel>
      </section>

      <form ref={rollCallRef} onSubmit={onSubmit} className="attendance-roll-call">
        <Panel title="Mark Daily Attendance" meta={records.length ? `${records.length - statusCounts.unmarked} OF ${records.length} MARKED` : "SELECT A CLASS TO BEGIN"}>
          {error ? <div className="alert err">{error}</div> : null}
          {message ? <div className="alert ok">{message}</div> : null}

          <div className="form-grid attendance-controls">
            <Field label="Class" required>
              <select
                className={inputClass}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                required
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} - {c.section}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Search students">
              <input
                type="search"
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, roll number or admission number"
                disabled={!classId}
              />
            </Field>
          </div>

          {classId ? (
            <section className="attendance-roster">
              <div className="attendance-roster-head">
                <div>
                  <h3>Student roster</h3>
                  <p>{records.length} students · {records.length - statusCounts.unmarked} marked · {statusCounts.unmarked} unmarked</p>
                </div>
                <div className="attendance-bulk-actions">
                  <button type="button" className="btn-ghost" onClick={() => markAll("present")}>All present</button>
                  <button type="button" className="btn-ghost" onClick={() => markAll("absent")}>All absent</button>
                </div>
              </div>
              {loadingRoster ? <div className="alert">Loading class roster and saved attendance…</div> : null}
              <div className="attendance-status-summary" aria-label="Attendance status counts">
                <span className="attendance-count unmarked">
                  <b>{statusCounts.unmarked}</b> Unmarked
                </span>
                {options.map((option) => (
                  <span key={option.value} className={`attendance-count ${option.cls}`}>
                    <b>{statusCounts[option.value]}</b> {option.label}
                  </span>
                ))}
              </div>
              <div className="att-row att-head">
                <div>Student</div>
                <div className="att-status-heading">Attendance status</div>
                <div>Note</div>
              </div>
              {filteredRecords.map((r) => {
                const idx = records.findIndex((record) => record.studentId === r.studentId);
                const student = students.find((s) => s._id === r.studentId);
                return (
                  <div className="att-row" key={r.studentId}>
                    <div className="attendance-student-cell">
                      <NameCell
                        name={student ? fullName(student) : r.studentId}
                        sub={[
                          student?.rollNumber ? `Roll ${student.rollNumber}` : null,
                          student?.admissionNo ? `Adm ${student.admissionNo}` : null,
                        ].filter(Boolean).join(" · ") || undefined}
                        imageUrl={student?.profilePhoto}
                      />
                      {student ? (
                        <label className={`attendance-photo-action${photoUploadingId === student._id ? " is-uploading" : ""}`}>
                          {photoUploadingId === student._id
                            ? "Saving…"
                            : student.profilePhoto
                              ? "Change photo"
                              : "Add photo"}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label={`${student.profilePhoto ? "Change" : "Add"} photo for ${fullName(student)}`}
                            disabled={photoUploadingId === student._id}
                            onChange={(event) => {
                              void updateStudentPhoto(student._id, event.currentTarget.files?.[0]);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="att-opts">
                      {options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`att-cell ${o.cls}${r.status === o.value ? " on" : ""}`}
                          title={o.label}
                          aria-label={`Mark ${student ? fullName(student) : "student"} ${o.label}`}
                          aria-pressed={r.status === o.value}
                          onClick={() => {
                            const next = [...records];
                            next[idx] = { ...r, status: o.value };
                            setRecords(next);
                          }}
                        >
                          {o.short}
                        </button>
                      ))}
                    </div>
                    <input
                      className={inputClass}
                      style={{ padding: "8px 11px" }}
                      placeholder="Note (optional)"
                      value={r.note || ""}
                      onChange={(e) => {
                        const next = [...records];
                        next[idx] = { ...r, note: e.target.value };
                        setRecords(next);
                      }}
                    />
                  </div>
                );
              })}
              {!records.length ? (
                <div className="attendance-empty">
                  No students enrolled in this class.
                </div>
              ) : null}
              {records.length > 0 && !filteredRecords.length ? (
                <div className="attendance-empty">No students match this search.</div>
              ) : null}
              {statusCounts.unmarked > 0 ? (
                <p className="attendance-unmarked-hint">
                  {statusCounts.unmarked} student{statusCounts.unmarked === 1 ? "" : "s"} still need a status before attendance can be saved.
                </p>
              ) : null}
            </section>
          ) : null}

          <div className="form-actions attendance-actions">
            <button type="submit" className="btn-dark" disabled={!classId || !records.length || statusCounts.unmarked > 0 || saving || loadingRoster}>
              {saving ? "Saving…" : "Save Attendance"}
            </button>
            <span>{presentCount} present · {statusCounts.absent} absent · {statusCounts.excused} leave · {statusCounts.late} late. Saved sheets reload for review before edits.</span>
          </div>
        </Panel>
      </form>

      <Panel title="Recent Sheets" meta="LAST 50">
        <div className="attendance-history-filters">
          <label>
            <span>Filter by class</span>
            <select className={inputClass} value={historyClassId} onChange={(event) => setHistoryClassId(event.target.value)}>
              <option value="">All classes</option>
              {classes.map((item) => <option key={item._id} value={item._id}>{item.name} - {item.section}</option>)}
            </select>
          </label>
        </div>
        {!visibleHistory.length ? (
          <EmptyState message="No attendance saved yet." />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th>Recorded by</th>
                  <th className="right">Marked</th>
                  <th className="right">Present</th>
                  <th className="right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((h) => {
                  const present = h.records.filter((r) => r.status === "present").length;
                  const rate = h.records.length
                    ? Math.round((present / h.records.length) * 100)
                    : 0;
                  const classLabel = labelOfClass(h.classId as never);
                  return (
                    <tr key={h._id}>
                      <td>{prettyDate(h.date)}</td>
                      <td>{classLabel}</td>
                      <td>{typeof h.takenBy === "object" && h.takenBy ? h.takenBy.name || "—" : "—"}</td>
                      <td className="num">{h.records.length}</td>
                      <td className="num">{present}</td>
                      <td className="right">
                        <span className={`badge ${rate >= 85 ? "present" : rate >= 70 ? "leave" : "absent"}`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
