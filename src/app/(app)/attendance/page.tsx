"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, Hero, NameCell, Panel, inputClass } from "@/components/ui";
import { CheckCalendarIcon } from "@/components/Icons";
import {
  AttendanceItem,
  ClassItem,
  StudentItem,
  fullName,
  labelOfClass,
  prettyDate,
  toDateInput,
} from "@/lib/types";

type Status = "present" | "absent" | "late" | "excused";
type RecordRow = { studentId: string; status: Status | ""; note?: string };

const options: { value: Status; short: string; cls: string }[] = [
  { value: "present", short: "P", cls: "p" },
  { value: "absent", short: "A", cls: "a" },
  { value: "late", short: "L", cls: "l" },
  { value: "excused", short: "E", cls: "e" },
];

export default function AttendancePage() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [history, setHistory] = useState<AttendanceItem[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadMeta = useCallback(async () => {
    const [c, a] = await Promise.all([
      fetch("/api/classes").then((r) => r.json()),
      fetch("/api/attendance").then((r) => r.json()),
    ]);
    setClasses(c.classes || []);
    setHistory(a.attendance || []);
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    let cancelled = false;
    if (!classId) {
      setStudents([]);
      setRecords([]);
      return;
    }

    setStudents([]);
    setRecords([]);
    setError("");
    setMessage("");

    Promise.all([
      fetch(`/api/students?classId=${encodeURIComponent(classId)}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load class students");
        return data;
      }),
      fetch(`/api/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load saved attendance");
        return data;
      }),
    ])
      .then(([studentData, attendanceData]) => {
        if (cancelled) return;
        const list: StudentItem[] = studentData.students || [];
        const sheet = (attendanceData.attendance || []).find((item: AttendanceItem) =>
          toDateInput(new Date(item.date)) === date
        );
        const saved = new Map<string, RecordRow>(
          (sheet?.records || []).map((record: { studentId: string | { _id: string }; status: Status; note?: string }) => {
            const id = typeof record.studentId === "string" ? record.studentId : record.studentId._id;
            return [id, { studentId: id, status: record.status, note: record.note || "" }];
          })
        );
        setStudents(list);
        setRecords(list.map((student) => saved.get(student._id) || {
          studentId: student._id,
          status: "",
          note: "",
        }));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load attendance");
      });

    return () => { cancelled = true; };
  }, [classId, date]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, date, records: records.filter((r): r is RecordRow & { status: Status } => Boolean(r.status)) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save attendance");
        return;
      }
      setMessage("Attendance saved for this date.");
      loadMeta();
    } finally {
      setSaving(false);
    }
  }

  function markAll(status: Status) {
    setRecords((prev) => prev.map((r) => ({ ...r, status })));
  }

  const selectedClass = classes.find((c) => c._id === classId);
  const presentCount = records.filter((r) => r.status === "present").length;
  const unmarkedCount = records.filter((r) => !r.status).length;

  const summary = useMemo(() => {
    if (!history.length) return null;
    const todayStr = toDateInput(new Date());
    const todaySheets = history.filter((h) => toDateInput(new Date(h.date)) === todayStr);
    const todayPresent = todaySheets.reduce((a, h) => a + h.records.filter((r) => r.status === "present").length, 0);
    const todayTotal = todaySheets.reduce((a, h) => a + h.records.length, 0);
    const recent = history.slice(0, 10);
    const rates = recent.map((h) => {
      const p = h.records.filter((r) => r.status === "present").length;
      return h.records.length ? (p / h.records.length) * 100 : 0;
    });
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    return { todaySheets: todaySheets.length, todayPresent, todayTotal, avgRate, totalSheets: history.length };
  }, [history]);

  return (
    <>
      <Hero
        title="Attendance"
        subtitle={`${prettyDate(date)}${selectedClass ? ` — Class ${selectedClass.name}-${selectedClass.section}` : ""}`}
        actionLabel="Mark All Present"
        actionIcon={<CheckCalendarIcon />}
        onAction={() => markAll("present")}
      />

      {summary ? (
        <div className="stat-row">
          <div className="stat-tile">
            <div className="st-val">{summary.todaySheets}</div>
            <div className="st-lab">Classes marked today</div>
          </div>
          {summary.todayTotal > 0 ? (
            <div className="stat-tile">
              <div className="st-val">{summary.todayPresent}/{summary.todayTotal}</div>
              <div className="st-lab">Present today</div>
            </div>
          ) : null}
          <div className="stat-tile">
            <div className="st-val" style={{ color: summary.avgRate >= 85 ? "var(--success, #16a34a)" : summary.avgRate >= 70 ? "var(--warn, #e97316)" : "var(--danger)" }}>
              {summary.avgRate}%
            </div>
            <div className="st-lab">Avg attendance (recent)</div>
          </div>
          <div className="stat-tile">
            <div className="st-val">{summary.totalSheets}</div>
            <div className="st-lab">Total sheets recorded</div>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit}>
        <Panel title="Daily Roll Call" meta={records.length ? `${presentCount}/${records.length} PRESENT${unmarkedCount ? ` · ${unmarkedCount} UNMARKED` : ""}` : undefined}>
          {error ? <div className="alert err">{error}</div> : null}
          {message ? <div className="alert ok">{message}</div> : null}

          <div className="form-grid">
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
            <Field label="Date" required>
              <input
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
          </div>

          {classId ? (
            <div style={{ marginTop: 22 }}>
              <div className="att-row att-head">
                <div>Student</div>
                <div style={{ textAlign: "center" }}>P / A / L / E</div>
                <div>Note</div>
              </div>
              {records.map((r, idx) => {
                const student = students.find((s) => s._id === r.studentId);
                return (
                  <div className="att-row" key={r.studentId}>
                    <NameCell
                      name={student ? fullName(student) : r.studentId}
                      sub={student?.rollNumber ? `Roll ${student.rollNumber}` : undefined}
                    />
                    <div className="att-opts">
                      {options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`att-cell ${o.cls}${r.status === o.value ? " on" : ""}`}
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
                <div style={{ padding: "18px 0", color: "var(--text-dim)", fontSize: 13 }}>
                  No students enrolled in this class.
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn-dark" disabled={!classId || !records.length || unmarkedCount > 0 || saving}>
              {saving ? "Saving…" : unmarkedCount ? `Mark all students first (${unmarkedCount} unmarked)` : "Save Attendance"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => markAll("absent")}>
              Mark All Absent
            </button>
          </div>
        </Panel>
      </form>

      <Panel title="Recent Sheets" meta="LAST 50">
        {!history.length ? (
          <EmptyState message="No attendance saved yet." />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Class</th>
                  <th className="right">Marked</th>
                  <th className="right">Present</th>
                  <th className="right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const present = h.records.filter((r) => r.status === "present").length;
                  const rate = h.records.length
                    ? Math.round((present / h.records.length) * 100)
                    : 0;
                  return (
                    <tr key={h._id}>
                      <td>{prettyDate(h.date)}</td>
                      <td>{labelOfClass(h.classId as never)}</td>
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
