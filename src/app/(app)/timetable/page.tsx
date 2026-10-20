"use client";

import { useEffect, useRef, useState } from "react";
import type { TimetableView, ConflictWarning } from "@/backend/services/timetable.service";
import type { Weekday } from "@/backend/models/Timetable";

type ClassRow = { _id: string; name: string; section: string; hasTimetable: boolean };
type Meta = { subjects: { _id: string; name: string; code: string }[]; teachers: { _id: string; name: string }[] };

const DAYS: Weekday[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getYear() {
  const n = new Date();
  const y = n.getFullYear();
  return n.getMonth() >= 3 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export default function TimetablePage() {
  const [academicYear, setAcademicYear] = useState(getYear());
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [tt, setTt] = useState<TimetableView | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);
  const [editSlot, setEditSlot] = useState<{ day: Weekday; period: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Slot editor state
  const [slotSubject, setSlotSubject] = useState("");
  const [slotTeacher, setSlotTeacher] = useState("");
  const [slotRoom, setSlotRoom] = useState("");
  const [slotLabel, setSlotLabel] = useState("");
  const [slotIsBreak, setSlotIsBreak] = useState(false);
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");

  useEffect(() => {
    fetch(`/api/timetable?action=classes&academicYear=${academicYear}`)
      .then((r) => r.json())
      .then(setClasses)
      .catch(() => setClasses([]));
    fetch(`/api/timetable?action=meta`)
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, [academicYear]);

  useEffect(() => {
    if (!selectedClass) { setTt(null); return; }
    setLoading(true);
    fetch(`/api/timetable/${selectedClass}?academicYear=${academicYear}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setTt)
      .catch(() => setTt(null))
      .finally(() => setLoading(false));
  }, [selectedClass, academicYear]);

  async function initTimetable() {
    const res = await fetch("/api/timetable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ classId: selectedClass, academicYear }),
    });
    if (res.ok) setTt(await res.json());
  }

  function openSlot(day: Weekday, period: number) {
    const existing = tt?.slots.find((s) => s.day === day && s.period === period);
    setSlotSubject(existing?.subjectId || "");
    setSlotTeacher(existing?.teacherId || "");
    setSlotRoom(existing?.room || "");
    setSlotLabel(existing?.label || "");
    setSlotIsBreak(existing?.isBreak || false);
    setSlotStart(existing?.startTime || "");
    setSlotEnd(existing?.endTime || "");
    setEditSlot({ day, period });
  }

  async function saveSlot() {
    if (!tt || !editSlot) return;
    setSaving(true);
    const slot = {
      day: editSlot.day,
      period: editSlot.period,
      subject: slotSubject || undefined,
      teacher: slotTeacher || undefined,
      room: slotRoom || undefined,
      label: slotLabel || undefined,
      isBreak: slotIsBreak,
      startTime: slotStart || undefined,
      endTime: slotEnd || undefined,
    };
    const res = await fetch(`/api/timetable/${selectedClass}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "setSlot", academicYear, slot }),
    });
    if (res.ok) {
      const data = await res.json();
      setTt(data.timetable);
      setConflicts(data.conflicts || []);
    }
    setSaving(false);
    setEditSlot(null);
  }

  async function clearSlot(day: Weekday, period: number) {
    if (!tt) return;
    await fetch(`/api/timetable/${selectedClass}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "clearSlot", academicYear, day, period }),
    });
    setTt((prev) => prev ? { ...prev, slots: prev.slots.filter((s) => !(s.day === day && s.period === period)) } : prev);
  }

  async function publish() {
    setPublishing(true);
    await fetch(`/api/timetable/${selectedClass}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", academicYear }),
    });
    setTt((prev) => prev ? { ...prev, publishedAt: new Date().toISOString() } : prev);
    setPublishing(false);
  }

  const activeDays = tt ? tt.days : ["Mon", "Tue", "Wed", "Thu", "Fri"] as Weekday[];
  const periods = tt ? Array.from({ length: tt.periodsPerDay }, (_, i) => i + 1) : [];

  return (
    <div className="page-wrap">
      <div className="page-head">
        <h1 className="page-title">Timetable</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="form-select" style={{ width: "auto" }}>
            {[0, 1, 2].map((offset) => {
              const y = new Date().getFullYear() - 1 + offset;
              const label = `${y}-${y + 1}`;
              return <option key={label} value={label}>{label}</option>;
            })}
          </select>
          <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="form-select" style={{ minWidth: 180 }}>
            <option value="">Select Class</option>
            {classes.map((c) => (
              <option key={c._id} value={c._id}>{c.name} {c.section}{c.hasTimetable ? " ✓" : ""}</option>
            ))}
          </select>
          {tt && !tt.publishedAt && (
            <button onClick={publish} disabled={publishing} className="btn btn-sm btn-primary">
              {publishing ? "Publishing…" : "Publish"}
            </button>
          )}
          {tt?.publishedAt && <span className="badge badge-success">Published</span>}
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="tt-conflicts">
          <b>Teacher conflicts:</b>
          {conflicts.map((c, i) => (
            <span key={i} className="tt-conflict-pill">{c.teacherName} — {c.day} P{c.period} also in {c.conflictClass}</span>
          ))}
        </div>
      )}

      {!selectedClass && <p className="mk-muted" style={{ marginTop: 24 }}>Select a class to view or edit its timetable.</p>}

      {selectedClass && loading && <p className="mk-muted" style={{ marginTop: 24 }}>Loading…</p>}

      {selectedClass && !loading && !tt && (
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <p>No timetable yet for this class.</p>
          <button onClick={initTimetable} className="btn btn-primary" style={{ marginTop: 8 }}>Create Timetable</button>
        </div>
      )}

      {tt && !loading && (
        <div className="tt-scroll">
          <table className="tt-grid">
            <thead>
              <tr>
                <th className="tt-th tt-period-head">Period</th>
                {activeDays.map((d) => <th key={d} className="tt-th">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p}>
                  <td className="tt-td tt-period-num">{p}</td>
                  {activeDays.map((d) => {
                    const slot = tt.slots.find((s) => s.day === d && s.period === p);
                    return (
                      <td key={d} className={`tt-td tt-cell${slot?.isBreak ? " tt-break" : ""}`} onClick={() => openSlot(d, p)}>
                        {slot ? (
                          slot.isBreak ? (
                            <span className="tt-break-label">{slot.label || "Break"}</span>
                          ) : (
                            <div className="tt-slot">
                              <span className="tt-subj">{slot.subjectName || slot.label || "—"}</span>
                              {slot.teacherName && <span className="tt-teacher">{slot.teacherName}</span>}
                              {slot.room && <span className="tt-room">{slot.room}</span>}
                            </div>
                          )
                        ) : <span className="tt-empty">+</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editSlot && (
        <div className="modal-backdrop" onClick={() => setEditSlot(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <b>Slot: {editSlot.day} — Period {editSlot.period}</b>
              <button type="button" className="modal-close" onClick={() => setEditSlot(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="form-label">
                <input type="checkbox" checked={slotIsBreak} onChange={(e) => setSlotIsBreak(e.target.checked)} /> Break / non-teaching slot
              </label>
              {!slotIsBreak && (
                <>
                  <label className="form-label">Subject
                    <select className="form-select" value={slotSubject} onChange={(e) => setSlotSubject(e.target.value)}>
                      <option value="">— none —</option>
                      {meta?.subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label className="form-label">Teacher
                    <select className="form-select" value={slotTeacher} onChange={(e) => setSlotTeacher(e.target.value)}>
                      <option value="">— none —</option>
                      {meta?.teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                  </label>
                  <label className="form-label">Room
                    <input className="form-input" value={slotRoom} onChange={(e) => setSlotRoom(e.target.value)} placeholder="e.g. R-12" />
                  </label>
                </>
              )}
              {slotIsBreak && (
                <label className="form-label">Label
                  <input className="form-input" value={slotLabel} onChange={(e) => setSlotLabel(e.target.value)} placeholder="Break, Assembly…" />
                </label>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <label className="form-label" style={{ flex: 1 }}>Start
                  <input type="time" className="form-input" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} />
                </label>
                <label className="form-label" style={{ flex: 1 }}>End
                  <input type="time" className="form-input" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} />
                </label>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-danger-outline btn-sm" onClick={() => { clearSlot(editSlot.day, editSlot.period); setEditSlot(null); }}>Clear Slot</button>
              <button className="btn btn-primary" onClick={saveSlot} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
