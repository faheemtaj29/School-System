"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, Hero, NameCell, PaginationControls, Panel, inputClass } from "@/components/ui";
import { CheckCalendarIcon } from "@/components/Icons";
import {
  AttendanceItem,
  ClassItem,
  StudentItem,
  fullName,
  labelOfClass,
  prettyDate,
  toDateInput,
  photoSrc,
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
  const [summaryHistory, setSummaryHistory] = useState<AttendanceItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(50);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [absentSaved, setAbsentSaved] = useState(0);
  /** Whether the open sheet was already saved for this class and date (else it is a new one). */
  const [sheetSaved, setSheetSaved] = useState(false);
  /** Day-by-day sheets of the selected class, newest first. */
  const [classHistory, setClassHistory] = useState<AttendanceItem[]>([]);
  const [classHistoryTotal, setClassHistoryTotal] = useState(0);
  const [classHistoryPage, setClassHistoryPage] = useState(1);
  const [alertsOn, setAlertsOn] = useState(true);

  useEffect(() => {
    // Settings → Notifications → "WhatsApp attendance alerts"
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setAlertsOn(d.settings?.whatsappAttendance !== false))
      .catch(() => {});
  }, []);

  const loadMeta = useCallback(async () => {
    const [c, a] = await Promise.all([
      fetch("/api/classes").then((r) => r.json()),
      fetch(`/api/attendance?page=${historyPage}&pageSize=${historyPageSize}`).then((r) => r.json()),
    ]);
    setClasses(c.classes || []);
    setHistory(a.attendance || []);
    setHistoryTotal(a.pagination?.total || 0);
    if (historyPage === 1) setSummaryHistory(a.attendance || []);
    else {
      const recent = await fetch(`/api/attendance?page=1&pageSize=${historyPageSize}`).then((r) => r.json());
      setSummaryHistory(recent.attendance || []);
    }
  }, [historyPage, historyPageSize]);

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
      fetch(`/api/student-leaves?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Unable to load approved student leave");
        return data;
      }),
    ])
      .then(([studentData, attendanceData, leaveData]) => {
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
        const approvedLeaves = new Map<string, { reason?: string }>(
          (leaveData.leaves || []).map((leave: { studentId: string | { _id: string }; reason?: string }) => {
            const id = typeof leave.studentId === "string" ? leave.studentId : leave.studentId._id;
            return [id, { reason: leave.reason }];
          })
        );
        setStudents(list);
        setSheetSaved(Boolean(sheet));
        setRecords(list.map((student) => {
          const existing = saved.get(student._id);
          const leave = approvedLeaves.get(student._id);
          if (leave && (!existing || existing.note?.startsWith("Approved leave"))) {
            return {
              ...(existing || { studentId: student._id }),
              status: "excused",
              note: `Approved leave${leave.reason ? `: ${leave.reason}` : ""}`,
            };
          }
          if (existing) return existing;
          return {
            studentId: student._id,
            status: leave ? "excused" : sheet ? "" : "present",
            note: leave ? `Approved leave${leave.reason ? `: ${leave.reason}` : ""}` : "",
          };
        }));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unable to load attendance");
      });

    return () => { cancelled = true; };
  }, [classId, date]);

  const loadClassHistory = useCallback(async (id: string) => {
    if (!id) {
      setClassHistory([]);
      setClassHistoryTotal(0);
      return;
    }
    const d = await fetch(`/api/attendance?classId=${encodeURIComponent(id)}&page=${classHistoryPage}&pageSize=${historyPageSize}`).then((r) => r.json()).catch(() => ({}));
    setClassHistory(d.attendance || []);
    setClassHistoryTotal(d.pagination?.total || 0);
    if (d.pagination?.page && d.pagination.page !== classHistoryPage) setClassHistoryPage(d.pagination.page);
  }, [classHistoryPage, historyPageSize]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches the class's saved sheets
    loadClassHistory(classId);
  }, [classId, loadClassHistory]);

  function shiftDay(days: number) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(toDateInput(d));
  }

  function openSheet(h: AttendanceItem) {
    const id = typeof h.classId === "object" ? h.classId._id : h.classId;
    setClassId(id);
    setDate(toDateInput(new Date(h.date)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
      setMessage(`Attendance sheet saved for ${prettyDate(date)}.`);
      setAbsentSaved(records.filter((r) => r.status === "absent").length);
      setSheetSaved(true);
      loadMeta();
      loadClassHistory(classId);
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
    if (!summaryHistory.length) return null;
    const todayStr = toDateInput(new Date());
    const todaySheets = summaryHistory.filter((h) => toDateInput(new Date(h.date)) === todayStr);
    const todayPresent = todaySheets.reduce((a, h) => a + h.records.filter((r) => r.status === "present").length, 0);
    const todayTotal = todaySheets.reduce((a, h) => a + h.records.length, 0);
    const recent = summaryHistory.slice(0, 10);
    const rates = recent.map((h) => {
      const p = h.records.filter((r) => r.status === "present").length;
      return h.records.length ? (p / h.records.length) * 100 : 0;
    });
    const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;
    return { todaySheets: todaySheets.length, todayPresent, todayTotal, avgRate, totalSheets: historyTotal };
  }, [summaryHistory, historyTotal]);

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
          {classId && records.length ? (
            <div className={`att-sheet-state${sheetSaved ? " saved" : ""}`}>
              {sheetSaved
                ? "Saved sheet — you are editing the attendance already recorded for this day."
                : "New sheet — students with approved leave start as Excused; others start Present. All statuses remain editable."}
            </div>
          ) : null}
          {error ? <div className="alert err">{error}</div> : null}
          {message ? (
            <div className="alert ok">
              {message}
              {alertsOn && absentSaved ? (
                <>
                  {" "}
                  <Link href={`/messages?kind=absence&date=${date}&classIds=${classId}`} className="link-btn">
                    Notify parents of {absentSaved} absent student{absentSaved === 1 ? "" : "s"} →
                  </Link>
                </>
              ) : null}
            </div>
          ) : null}

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
              <div className="att-day-nav">
                <button type="button" className="btn-ghost" onClick={() => shiftDay(-1)} title="Previous day" aria-label="Previous day">
                  ‹
                </button>
                <input
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                <button type="button" className="btn-ghost" onClick={() => shiftDay(1)} title="Next day" aria-label="Next day">
                  ›
                </button>
              </div>
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
                    <Link href={`/students/${r.studentId}`} className="name-link" title="Open profile: full attendance record">
                      <NameCell
                        name={student ? fullName(student) : r.studentId}
                        photo={student ? photoSrc("student", student) : null}
                        sub={student?.rollNumber ? `Roll ${student.rollNumber}` : undefined}
                      />
                    </Link>
                    <div className="att-opts">
                      {options.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          className={`att-cell ${o.cls}${r.status === o.value ? " on" : ""}`}
                          onClick={() => {
                            const next = [...records];
                            next[idx] = {
                              ...r,
                              status: o.value,
                              note: r.note?.startsWith("Approved leave") && o.value !== "excused" ? "" : r.note,
                            };
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
              {saving ? "Saving…" : unmarkedCount ? `Mark all students first (${unmarkedCount} unmarked)` : sheetSaved ? "Update sheet" : "Save sheet"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => markAll("absent")}>
              Mark All Absent
            </button>
          </div>
        </Panel>
      </form>

      <Panel
        title={selectedClass ? `Attendance History — ${selectedClass.name}-${selectedClass.section}` : "Recent Sheets"}
        meta={selectedClass ? `${classHistoryTotal} DAY${classHistoryTotal === 1 ? "" : "S"}` : `ALL CLASSES · ${historyTotal} SHEETS`}
      >
        {(selectedClass ? classHistory : history).length === 0 ? (
          <EmptyState message={selectedClass ? "No sheets saved for this class yet." : "No attendance saved yet."} />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Date</th>
                  {selectedClass ? null : <th>Class</th>}
                  <th className="right">Present</th>
                  <th className="right">Absent</th>
                  <th className="right">Late</th>
                  <th className="right">Leave</th>
                  <th className="right">Rate</th>
                  {selectedClass ? <th>Absent students</th> : null}
                  <th className="right">Sheet</th>
                </tr>
              </thead>
              <tbody>
                {(selectedClass ? classHistory : history).map((h) => {
                  const count = (st: Status) => h.records.filter((r) => r.status === st).length;
                  const present = count("present");
                  const rate = h.records.length ? Math.round((present / h.records.length) * 100) : 0;
                  const absentees = h.records
                    .filter((r) => r.status === "absent")
                    .map((r) => (typeof r.studentId === "object" ? fullName(r.studentId) : ""))
                    .filter(Boolean);
                  const isOpen = toDateInput(new Date(h.date)) === date && (typeof h.classId === "object" ? h.classId._id : h.classId) === classId;
                  return (
                    <tr key={h._id} className={isOpen ? "att-row-open" : undefined}>
                      <td>
                        <b>{prettyDate(h.date)}</b>
                        <div className="cell-sub">{new Date(h.date).toLocaleDateString("en-GB", { weekday: "long" })}</div>
                      </td>
                      {selectedClass ? null : <td>{labelOfClass(h.classId as never)}</td>}
                      <td className="num">{present}</td>
                      <td className="num">{count("absent") || ""}</td>
                      <td className="num">{count("late") || ""}</td>
                      <td className="num">{count("excused") || ""}</td>
                      <td className="right">
                        <span className={`badge ${rate >= 85 ? "present" : rate >= 70 ? "leave" : "absent"}`}>{rate}%</span>
                      </td>
                      {selectedClass ? <td className="att-absentees">{absentees.join(", ") || "—"}</td> : null}
                      <td className="right">
                        <button type="button" className="link-btn" onClick={() => openSheet(h)}>
                          {isOpen ? "Open" : "View / edit"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(selectedClass ? classHistoryTotal : historyTotal) ? (
          <PaginationControls
            page={selectedClass ? classHistoryPage : historyPage}
            pageSize={historyPageSize}
            total={selectedClass ? classHistoryTotal : historyTotal}
            pageCount={Math.max(1, Math.ceil((selectedClass ? classHistoryTotal : historyTotal) / historyPageSize))}
            onPageChange={selectedClass ? setClassHistoryPage : setHistoryPage}
            onPageSizeChange={(size) => {
              setHistoryPageSize(size);
              setHistoryPage(1);
              setClassHistoryPage(1);
            }}
          />
        ) : null}
      </Panel>
    </>
  );
}
