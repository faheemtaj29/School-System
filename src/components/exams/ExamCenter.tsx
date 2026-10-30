"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { EmptyState, Field, Panel, inputClass } from "@/components/ui";

/* ---------- shared types ---------- */

export type TermOption = {
  _id: string;
  name: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: string;
};

type Component = { key: string; label: string; maxMarks: number };

type ClassOption = {
  _id: string;
  classLabel: string;
  students: number;
  subjects: { _id: string; name: string; code: string }[];
};

type PlanRow = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  examDate: string;
  day: string;
  startTime: string;
  endTime: string;
  components: Component[];
  totalMarks: number;
  passingMarks: number;
};

type ClassPlan = { classId: string; classLabel: string; warnings: string[]; replaces: boolean; rows: PlanRow[] };

type OverviewSubject = {
  _id: string;
  name: string;
  code: string;
  examDate?: string;
  startTime?: string;
  endTime?: string;
  totalMarks: number;
  components: Component[];
  marksEntered: number;
};

type OverviewClass = {
  scheduleId: string;
  classId: string;
  classLabel: string;
  status: string;
  papers: number;
  students: number;
  rollNumbers: number;
  marksEntered: number;
  marksExpected: number;
  firstPaper: string | null;
  subjects: OverviewSubject[];
};

/** `limited`: a teacher, shown only the papers they may mark. */
type Overview = { term: TermOption; classes: OverviewClass[]; limited?: boolean };

/** One correction of a mark: old → new total, who, when and why. */
type MarkChange = { at: string; by: string; reason: string; from: string; to: string };

function changeText(h: MarkChange) {
  const when = new Date(h.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${h.from} → ${h.to} · ${h.by || "—"} · ${when}${h.reason ? ` · ${h.reason}` : ""}`;
}

/** "Corrected 2×" next to a mark, with the full history on hover / tap. */
function Corrected({ history }: { history?: MarkChange[] }) {
  if (!history?.length) return null;
  return (
    <span className="ec-fixed" title={history.map(changeText).join("\n")}>
      corrected {history.length}×
    </span>
  );
}

/** Once results are final, every change to marks needs a reason (kept in the history). */
function ReasonBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="alert warn ec-final">
      <b>Results are final.</b> You can still correct a mistake — say why, and the change is kept in the correction history.
      <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Reason for correction, e.g. totalling error in Q3" />
    </div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Ready-made marks patterns for school, college and university papers. */
const PATTERNS: { name: string; components: Component[] }[] = [
  { name: "Written only (100)", components: [{ key: "written", label: "Written", maxMarks: 100 }] },
  {
    name: "Theory + Practical",
    components: [
      { key: "theory", label: "Theory", maxMarks: 75 },
      { key: "practical", label: "Practical", maxMarks: 25 },
    ],
  },
  {
    name: "Theory + Practical + Viva",
    components: [
      { key: "theory", label: "Theory", maxMarks: 60 },
      { key: "practical", label: "Practical", maxMarks: 25 },
      { key: "viva", label: "Viva", maxMarks: 15 },
    ],
  },
  {
    name: "University (VU style)",
    components: [
      { key: "assignment", label: "Assignments", maxMarks: 10 },
      { key: "quiz", label: "Quizzes", maxMarks: 5 },
      { key: "gdb", label: "GDB", maxMarks: 5 },
      { key: "mid", label: "Mid Term", maxMarks: 30 },
      { key: "final", label: "Final Term", maxMarks: 50 },
    ],
  },
];

const hint = { fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 } as const;

function keyFor(label: string, taken: string[]) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "part";
  let key = base;
  let n = 2;
  while (taken.includes(key)) key = `${base}${n++}`;
  return key;
}

function dayName(date: string) {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : DAYS[d.getUTCDay()];
}

function prettyDay(date?: string | null) {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as T;
}

function openPrint(path: string) {
  window.open(path, "_blank", "noopener");
}

/** Term picker shared by all four steps, with quick "new term" creation. */
function TermPicker({
  terms,
  termId,
  onChange,
  onCreated,
  canCreate,
}: {
  terms: TermOption[];
  termId: string;
  onChange: (id: string) => void;
  onCreated: () => Promise<void>;
  canCreate: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", academicYear: "", startDate: "", endDate: "" });
  const [err, setErr] = useState("");

  async function create() {
    setErr("");
    try {
      const data = await call<{ term: TermOption }>("/api/exams/terms", {
        method: "POST",
        body: JSON.stringify({ ...form, status: "active" }),
      });
      await onCreated();
      onChange(data.term._id);
      setAdding(false);
      setForm({ name: "", academicYear: "", startDate: "", endDate: "" });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="ec-term">
      <Field label="Exam / Term">
        <select className={inputClass} value={termId} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select exam term…</option>
          {terms.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name} · {t.academicYear}
            </option>
          ))}
        </select>
      </Field>
      {canCreate ? (
        <button type="button" className="btn-ghost" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ New term"}
        </button>
      ) : null}
      {adding ? (
        <div className="ec-term-new">
          {err ? <div className="alert err">{err}</div> : null}
          <div className="form-grid ec-grid-4">
            <Field label="Name">
              <input className={inputClass} placeholder="e.g. Final Term" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Session">
              <input className={inputClass} placeholder="2026–27" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} />
            </Field>
            <Field label="From">
              <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </Field>
            <Field label="To">
              <input type="date" className={inputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </Field>
          </div>
          <button type="button" className="btn-dark" onClick={create}>
            Create term
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ClassChecklist({
  classes,
  selected,
  onChange,
  note,
}: {
  classes: { id: string; label: string; note?: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  note?: string;
}) {
  const all = classes.length > 0 && selected.length === classes.length;
  return (
    <div>
      <div className="ec-check-head">
        <label className="ec-check">
          <input
            type="checkbox"
            checked={all}
            onChange={() => onChange(all ? [] : classes.map((c) => c.id))}
          />
          <b>Select all classes</b>
        </label>
        <span style={hint}>{selected.length} selected{note ? ` · ${note}` : ""}</span>
      </div>
      <div className="ec-checks">
        {classes.map((c) => (
          <label key={c.id} className={`ec-check-card${selected.includes(c.id) ? " on" : ""}`}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={() =>
                onChange(
                  selected.includes(c.id) ? selected.filter((x) => x !== c.id) : [...selected, c.id]
                )
              }
            />
            <span>
              <b>{c.label}</b>
              {c.note ? <small>{c.note}</small> : null}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------- Step 1: Date sheet ---------- */

function DateSheetStep({ termId, term, onSaved }: { termId: string; term?: TermOption; onSaved: () => void }) {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [opts, setOpts] = useState({
    startDate: "",
    endDate: "",
    startTime: "09:00",
    endTime: "12:00",
    offDays: [0],
    gapDays: 0,
    passPercent: 40,
  });
  const [holiday, setHoliday] = useState("");
  const [holidays, setHolidays] = useState<string[]>([]);
  const [components, setComponents] = useState<Component[]>(PATTERNS[0].components);
  const [plans, setPlans] = useState<ClassPlan[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    call<{ classes: ClassOption[] }>("/api/exams/center/classes")
      .then((d) => setClasses(d.classes))
      .catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!term) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpts((o) => ({ ...o, startDate: term.startDate.slice(0, 10), endDate: term.endDate.slice(0, 10) }));
    setPlans(null);
  }, [term]);

  const total = components.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0);

  async function generate() {
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const data = await call<{ plans: ClassPlan[] }>("/api/exams/center/plan", {
        method: "POST",
        body: JSON.stringify({ termId, classIds: selected, ...opts, holidays, components }),
      });
      setPlans(data.plans);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateRow(ci: number, ri: number, patch: Partial<PlanRow>) {
    setPlans((list) =>
      (list || []).map((p, i) =>
        i !== ci
          ? p
          : {
              ...p,
              rows: p.rows.map((r, j) => {
                if (j !== ri) return r;
                const next = { ...r, ...patch };
                next.day = dayName(next.examDate);
                next.totalMarks = next.components.reduce((s, c) => s + (Number(c.maxMarks) || 0), 0);
                return next;
              }),
            }
      )
    );
  }

  function removeRow(ci: number, ri: number) {
    setPlans((list) =>
      (list || []).map((p, i) => (i !== ci ? p : { ...p, rows: p.rows.filter((_, j) => j !== ri) }))
    );
  }

  async function save() {
    if (!plans) return;
    setErr("");
    setBusy(true);
    try {
      const schedules = plans
        .filter((p) => p.rows.length)
        .map((p) => ({
          classId: p.classId,
          rows: p.rows.map((r) => ({
            subjectId: r.subjectId,
            examDate: r.examDate || null,
            startTime: r.startTime || null,
            endTime: r.endTime || null,
            totalMarks: r.totalMarks,
            passingMarks: r.passingMarks,
            components: r.components.filter((c) => Number(c.maxMarks) > 0),
          })),
        }));
      const data = await call<{ saved: number }>("/api/exams/center/datesheets", {
        method: "POST",
        body: JSON.stringify({ termId, status: "published", schedules }),
      });
      setMsg(`Date sheet saved for ${data.saved} class(es). Next: issue roll numbers and print slips.`);
      setPlans(null);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!termId) return <EmptyState message="Select or create an exam term above to start the date sheet." />;

  const missingDates = plans?.some((p) => p.rows.some((r) => !r.examDate));

  return (
    <div className="stack-lg">
      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <Panel title="① Choose classes" meta="SUBJECTS LOAD AUTOMATICALLY">
        <ClassChecklist
          classes={classes.map((c) => ({
            id: c._id,
            label: c.classLabel,
            note: `${c.students} students · ${c.subjects.length} subjects`,
          }))}
          selected={selected}
          onChange={(ids) => {
            setSelected(ids);
            setPlans(null);
          }}
        />
        {classes.some((c) => selected.includes(c._id) && !c.subjects.length) ? (
          <div className="alert err" style={{ marginTop: 12 }}>
            Some selected classes have no subjects. Map subjects under Classes &amp; Sections first.
          </div>
        ) : null}
      </Panel>

      <Panel title="② Dates & paper timing">
        <div className="form-grid ec-grid-4">
          <Field label="First paper from">
            <input type="date" className={inputClass} value={opts.startDate} onChange={(e) => setOpts({ ...opts, startDate: e.target.value })} />
          </Field>
          <Field label="Last paper by">
            <input type="date" className={inputClass} value={opts.endDate} onChange={(e) => setOpts({ ...opts, endDate: e.target.value })} />
          </Field>
          <Field label="Paper starts">
            <input type="time" className={inputClass} value={opts.startTime} onChange={(e) => setOpts({ ...opts, startTime: e.target.value })} />
          </Field>
          <Field label="Paper ends">
            <input type="time" className={inputClass} value={opts.endTime} onChange={(e) => setOpts({ ...opts, endTime: e.target.value })} />
          </Field>
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Weekly off days (no paper)">
            <div className="ec-chips">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  className={`ec-chip${opts.offDays.includes(i) ? " on" : ""}`}
                  onClick={() =>
                    setOpts({
                      ...opts,
                      offDays: opts.offDays.includes(i)
                        ? opts.offDays.filter((x) => x !== i)
                        : [...opts.offDays, i],
                    })
                  }
                >
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Preparation gap between papers">
            <select className={inputClass} value={opts.gapDays} onChange={(e) => setOpts({ ...opts, gapDays: Number(e.target.value) })}>
              <option value={0}>No gap — a paper every working day</option>
              <option value={1}>1 day gap</option>
              <option value={2}>2 days gap</option>
            </select>
          </Field>
          <Field label="Holidays (skipped)">
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" className={inputClass} value={holiday} onChange={(e) => setHoliday(e.target.value)} />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  if (holiday && !holidays.includes(holiday)) setHolidays([...holidays, holiday].sort());
                  setHoliday("");
                }}
              >
                Add
              </button>
            </div>
            <div className="ec-chips" style={{ marginTop: 6 }}>
              {holidays.map((h) => (
                <button key={h} type="button" className="ec-chip on" onClick={() => setHolidays(holidays.filter((x) => x !== h))} title="Remove">
                  {prettyDay(h)} ✕
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel title="③ Marks pattern" meta={`TOTAL ${total} · PASS ${opts.passPercent}%`}>
        <div className="ec-chips" style={{ marginBottom: 12 }}>
          {PATTERNS.map((p) => (
            <button key={p.name} type="button" className="ec-chip" onClick={() => setComponents(p.components)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="ec-components">
          {components.map((c, i) => (
            <div key={c.key} className="ec-component">
              <input
                className={inputClass}
                value={c.label}
                onChange={(e) =>
                  setComponents(components.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <input
                type="number"
                min={1}
                className={inputClass}
                value={c.maxMarks}
                onChange={(e) =>
                  setComponents(
                    components.map((x, j) => (j === i ? { ...x, maxMarks: Number(e.target.value) } : x))
                  )
                }
              />
              {components.length > 1 ? (
                <button type="button" className="btn-ghost" onClick={() => setComponents(components.filter((_, j) => j !== i))}>
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              setComponents([
                ...components,
                { key: keyFor("Part", components.map((c) => c.key)), label: "Part", maxMarks: 10 },
              ])
            }
          >
            + Add part
          </button>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "end", marginTop: 14, flexWrap: "wrap" }}>
          <Field label="Passing %">
            <input type="number" min={1} max={100} className={inputClass} style={{ width: 110 }} value={opts.passPercent} onChange={(e) => setOpts({ ...opts, passPercent: Number(e.target.value) })} />
          </Field>
          <div style={hint}>
            You can change marks per subject in the preview — e.g. set Practical to 0 for subjects without a practical.
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn-dark" disabled={busy || !selected.length} onClick={generate}>
            {busy ? "Working…" : `Generate date sheet for ${selected.length || "…"} class(es)`}
          </button>
        </div>
      </Panel>

      {plans ? (
        <Panel title="④ Review & save" meta={`${plans.length} CLASS(ES)`}>
          {plans.map((p, ci) => (
            <div key={p.classId} className="ec-plan">
              <div className="ec-plan-head">
                <b>{p.classLabel}</b>
                <span style={hint}>{p.rows.length} papers</span>
                {p.replaces ? <span className="ec-note">Replaces the existing date sheet</span> : null}
              </div>
              {p.warnings.map((w) => (
                <div key={w} className="alert err" style={{ marginBottom: 8 }}>
                  {w}
                </div>
              ))}
              <div className="table-scroll">
                <table className="ec-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subject</th>
                      <th>Date</th>
                      <th>Day</th>
                      <th>Start</th>
                      <th>End</th>
                      {p.rows[0]?.components.map((c) => (
                        <th key={c.key}>{c.label}</th>
                      ))}
                      <th>Total</th>
                      <th>Pass</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r, ri) => (
                      <tr key={r.subjectId} className={r.examDate ? "" : "ec-missing"}>
                        <td>{ri + 1}</td>
                        <td>
                          <b>{r.subjectName}</b>
                          <div style={hint}>{r.subjectCode}</div>
                        </td>
                        <td>
                          <input type="date" className={inputClass} value={r.examDate} onChange={(e) => updateRow(ci, ri, { examDate: e.target.value })} />
                        </td>
                        <td>{r.day || "—"}</td>
                        <td>
                          <input type="time" className={inputClass} value={r.startTime} onChange={(e) => updateRow(ci, ri, { startTime: e.target.value })} />
                        </td>
                        <td>
                          <input type="time" className={inputClass} value={r.endTime} onChange={(e) => updateRow(ci, ri, { endTime: e.target.value })} />
                        </td>
                        {r.components.map((c, k) => (
                          <td key={c.key}>
                            <input
                              type="number"
                              min={0}
                              className={`${inputClass} ec-num`}
                              value={c.maxMarks}
                              onChange={(e) =>
                                updateRow(ci, ri, {
                                  components: r.components.map((x, m) =>
                                    m === k ? { ...x, maxMarks: Number(e.target.value) } : x
                                  ),
                                })
                              }
                            />
                          </td>
                        ))}
                        <td className="mono">{r.totalMarks}</td>
                        <td>
                          <input type="number" min={0} className={`${inputClass} ec-num`} value={r.passingMarks} onChange={(e) => updateRow(ci, ri, { passingMarks: Number(e.target.value) })} />
                        </td>
                        <td>
                          <button type="button" className="ec-x" onClick={() => removeRow(ci, ri)} title="Remove paper">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {missingDates ? (
            <div className="alert err">Some papers have no date yet (highlighted). Pick a date or remove them before saving.</div>
          ) : null}
          <div className="form-actions">
            <button type="button" className="btn-dark" disabled={busy || missingDates} onClick={save}>
              {busy ? "Saving…" : `Save & publish ${plans.length} date sheet(s)`}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setPlans(null)}>
              Discard
            </button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ---------- Step 2: Roll number slips ---------- */

function SlipsStep({ termId, overview, isAdmin, reload }: { termId: string; overview: Overview | null; isAdmin: boolean; reload: () => void }) {
  const classes = overview?.classes || [];
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"sequence" | "class">("sequence");
  const [startFrom, setStartFrom] = useState(1001);
  const [prefix, setPrefix] = useState("");
  const [perPage, setPerPage] = useState(2);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function issue(overwrite: boolean) {
    setErr("");
    setMsg("");
    if (overwrite && !confirm("Re-number all selected students? Already printed slips will no longer match.")) return;
    try {
      const data = await call<{ issued: number }>("/api/exams/center/roll-numbers", {
        method: "POST",
        body: JSON.stringify({ termId, classIds: selected, mode, startFrom, prefix, overwrite }),
      });
      setMsg(data.issued ? `${data.issued} roll number(s) issued.` : "Everyone already has a roll number.");
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!termId) return <EmptyState message="Select an exam term above." />;
  if (!classes.length) return <EmptyState message="No date sheet in this term yet — create it in step ① first." />;

  const missing = classes
    .filter((c) => selected.includes(c.classId))
    .reduce((s, c) => s + Math.max(0, c.students - c.rollNumbers), 0);

  return (
    <div className="stack-lg">
      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}
      <Panel title="Classes" meta="ROLL NO SLIPS">
        <ClassChecklist
          classes={classes.map((c) => ({
            id: c.classId,
            label: c.classLabel,
            note: `${c.rollNumbers}/${c.students} roll nos · ${c.papers} papers`,
          }))}
          selected={selected}
          onChange={setSelected}
        />
      </Panel>
      {isAdmin ? (
        <Panel title="Roll numbers">
          <div className="form-grid ec-grid-4">
            <Field label="Numbering">
              <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as "sequence" | "class")}>
                <option value="sequence">Running numbers across classes</option>
                <option value="class">Use class roll numbers</option>
              </select>
            </Field>
            {mode === "sequence" ? (
              <Field label="Start from">
                <input type="number" className={inputClass} value={startFrom} onChange={(e) => setStartFrom(Number(e.target.value))} />
              </Field>
            ) : null}
            <Field label="Prefix (optional)">
              <input className={inputClass} value={prefix} maxLength={10} placeholder="e.g. FT-" onChange={(e) => setPrefix(e.target.value)} />
            </Field>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-dark" disabled={!selected.length} onClick={() => issue(false)}>
              Issue roll numbers{missing ? ` (${missing} missing)` : ""}
            </button>
            <button type="button" className="btn-ghost" disabled={!selected.length} onClick={() => issue(true)}>
              Re-number all
            </button>
          </div>
          <div style={hint}>Existing roll numbers are kept, so slips you already printed stay valid.</div>
        </Panel>
      ) : null}
      <Panel title="Print">
        <div className="form-grid ec-grid-4">
          <Field label="Slips per A4 page">
            <select className={inputClass} value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </Field>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn-dark"
            disabled={!selected.length}
            onClick={() => openPrint(`/print/roll-slips?termId=${termId}&classIds=${selected.join(",")}&perPage=${perPage}`)}
          >
            Print roll number slips
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!selected.length}
            onClick={() => openPrint(`/print/date-sheet?termId=${termId}&classIds=${selected.join(",")}`)}
          >
            Print date sheet
          </button>
          <a
            className={`wa-btn${selected.length ? "" : " disabled"}`}
            href={selected.length ? `/messages?kind=datesheet&termId=${termId}&classIds=${selected.join(",")}` : undefined}
          >
            Send date sheet on WhatsApp
          </a>
        </div>
      </Panel>
    </div>
  );
}

/* ---------- Step 3: Marks entry ---------- */

type SheetStudent = {
  _id: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  marks: Record<string, number>;
  absent: boolean;
  remarks: string;
  saved: boolean;
  history?: MarkChange[];
};

type MarksSheet = {
  final?: boolean;
  classLabel: string;
  subject: { _id: string; name: string; code: string };
  totalMarks: number;
  passingMarks: number;
  components: Component[];
  students: SheetStudent[];
};

function gradeOf(percent: number) {
  if (percent >= 80) return "A+";
  if (percent >= 70) return "A";
  if (percent >= 60) return "B";
  if (percent >= 50) return "C";
  if (percent >= 40) return "D";
  return "F";
}

/** Marks entry two ways: a whole class in one paper, or one student in every paper. */
function MarksStep({ termId, overview, reload }: { termId: string; overview: Overview | null; reload: () => void }) {
  const [by, setBy] = useState<"subject" | "student">("subject");
  return (
    <div className="stack-lg">
      <div className="chips">
        <button type="button" className={`filter-chip${by === "subject" ? " active" : ""}`} onClick={() => setBy("subject")}>
          By subject — whole class in one paper
        </button>
        <button type="button" className={`filter-chip${by === "student" ? " active" : ""}`} onClick={() => setBy("student")}>
          By student — all papers of one student
        </button>
      </div>
      {overview?.limited ? (
        <div className="alert">
          You see the papers you teach. As class teacher you see every paper of your class, so you can prepare the whole
          class result; all marks compile into the same result cards.
        </div>
      ) : null}
      {by === "subject" ? (
        <SubjectMarks termId={termId} overview={overview} reload={reload} />
      ) : (
        <StudentMarks termId={termId} overview={overview} reload={reload} />
      )}
    </div>
  );
}

type StudentPaper = {
  subject: { _id: string; name: string; code: string };
  examDate: string | null;
  totalMarks: number;
  passingMarks: number;
  components: Component[];
  marks: Record<string, number>;
  absent: boolean;
  remarks: string;
  saved: boolean;
  history?: MarkChange[];
};

type StudentSheet = {
  final?: boolean;
  classLabel: string;
  papers: number;
  students: { _id: string; name: string; admissionNo: string; rollNo: string; done: number }[];
  studentId: string | null;
  subjects: StudentPaper[];
};

/**
 * Result preparation by student: pick a student and fill every paper — written, theory,
 * practical, viva or whatever parts each paper has — then save and move to the next student.
 */
function StudentMarks({ termId, overview, reload }: { termId: string; overview: Overview | null; reload: () => void }) {
  const classes = overview?.classes || [];
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [reason, setReason] = useState("");
  const [sheet, setSheet] = useState<StudentSheet | null>(null);
  const [papers, setPapers] = useState<StudentPaper[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!termId || !classId) return;
    setErr("");
    try {
      const qs = new URLSearchParams({ termId, classId, ...(studentId ? { studentId } : {}) });
      const data = await call<StudentSheet>(`/api/exams/center/marks/student?${qs}`);
      setSheet(data);
      setPapers(data.subjects);
      setDirty(false);
      if (data.studentId && data.studentId !== studentId) setStudentId(data.studentId);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [termId, classId, studentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    load();
  }, [load]);

  function go(nextClass: string, nextStudent: string) {
    if (dirty && !confirm("You have unsaved marks. Discard them?")) return;
    setMsg("");
    if (nextClass !== classId) setSheet(null);
    setClassId(nextClass);
    setStudentId(nextStudent);
  }

  function update(i: number, patch: Partial<StudentPaper>) {
    setDirty(true);
    setPapers((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function setMark(i: number, key: string, value: string) {
    const marks = { ...papers[i].marks };
    if (value === "") delete marks[key];
    else marks[key] = Number(value);
    update(i, { marks });
  }

  /** Enter / Tab-like: the next mark box down the sheet. */
  function onKey(e: KeyboardEvent<HTMLInputElement>, cell: number) {
    const move = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-scell="${cell + move}"]`);
    next?.focus();
    next?.select();
  }

  const students = sheet?.students || [];
  const index = students.findIndex((s) => s._id === studentId);
  const student = students[index];

  async function save(then?: "next") {
    if (!sheet || !student) return;
    setErr("");
    setMsg("");
    const over = papers.find((p) => p.components.some((c) => (p.marks[c.key] ?? 0) > c.maxMarks));
    if (over) {
      setErr(`${over.subject.name}: marks are more than the maximum.`);
      return;
    }
    // Papers left blank are skipped, so a half-finished sheet never saves zeros.
    const filled = papers.filter((p) => p.absent || Object.keys(p.marks).length);
    if (!filled.length) {
      setErr("Enter marks in at least one paper.");
      return;
    }
    setBusy(true);
    try {
      await call("/api/exams/center/marks/student", {
        method: "PUT",
        body: JSON.stringify({
          termId,
          classId,
          studentId: student._id,
          subjects: filled.map((p) => ({ subjectId: p.subject._id, marks: p.marks, absent: p.absent, remarks: p.remarks || undefined })),
          reason: reason.trim() || undefined,
        }),
      });
      setReason("");
      setMsg(`Saved ${student.name}: ${filled.length} of ${papers.length} papers.`);
      setDirty(false);
      reload();
      const next = students[index + 1];
      if (then === "next" && next) setStudentId(next._id);
      else await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!termId) return <EmptyState message="Select an exam term above." />;
  if (!classes.length) return <EmptyState message="No date sheet in this term yet — create it in step ① first." />;

  const grand = papers.reduce(
    (t, p) => {
      const got = p.absent ? 0 : p.components.reduce((s, c) => s + (p.marks[c.key] ?? 0), 0);
      return { got: t.got + got, max: t.max + p.totalMarks };
    },
    { got: 0, max: 0 }
  );
  let cell = 0;

  return (
    <div className="stack-lg">
      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}
      <Panel title="Pick class & student">
        <div className="form-grid">
          <Field label="Class">
            <select className={inputClass} value={classId} onChange={(e) => go(e.target.value, "")}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>{c.classLabel}</option>
              ))}
            </select>
          </Field>
          {sheet ? (
            <Field label="Student">
              <select className={inputClass} value={studentId} onChange={(e) => go(classId, e.target.value)}>
                {students.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.rollNo ? `${s.rollNo} · ` : ""}{s.name} — {s.done}/{sheet.papers} papers{s.done >= sheet.papers ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        {sheet && students.length ? (
          <div className="ec-student-nav">
            <button type="button" className="btn-ghost" disabled={index <= 0} onClick={() => go(classId, students[index - 1]._id)}>
              ‹ Previous
            </button>
            <span>
              Student {index + 1} of {students.length} · {students.filter((s) => s.done >= sheet.papers).length} complete
            </span>
            <button type="button" className="btn-ghost" disabled={index >= students.length - 1} onClick={() => go(classId, students[index + 1]._id)}>
              Next ›
            </button>
          </div>
        ) : null}
      </Panel>

      {sheet && student ? (
        <Panel title={`${student.name} — ${sheet.classLabel}`} meta={`${student.rollNo ? `ROLL ${student.rollNo} · ` : ""}${student.admissionNo}`}>
          <div className="table-scroll">
            <table className="ec-table ec-marks">
              <thead>
                <tr>
                  <th>Paper</th>
                  <th>Marks — each part</th>
                  <th>Total</th>
                  <th>Grade</th>
                  <th>Absent</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p, i) => {
                  const total = p.absent ? 0 : p.components.reduce((s, c) => s + (p.marks[c.key] ?? 0), 0);
                  const empty = !p.absent && !Object.keys(p.marks).length;
                  const pct = p.totalMarks ? (total / p.totalMarks) * 100 : 0;
                  return (
                    <tr key={p.subject._id} className={p.absent ? "ec-absent" : ""}>
                      <td>
                        <b>{p.subject.name}</b>
                        <div style={hint}>
                          {p.subject.code} · max {p.totalMarks} · pass {p.passingMarks}
                          {p.saved ? " · saved" : ""} <Corrected history={p.history} />
                        </div>
                      </td>
                      <td>
                        <div className="ec-parts">
                          {p.components.map((c) => {
                            const v = p.marks[c.key];
                            const at = cell++;
                            return (
                              <label key={c.key}>
                                <span>
                                  {c.label} <small>/{c.maxMarks}</small>
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  max={c.maxMarks}
                                  step="0.5"
                                  disabled={p.absent}
                                  data-scell={at}
                                  className={`${inputClass} ec-num${v != null && v > c.maxMarks ? " ec-bad" : ""}`}
                                  value={v ?? ""}
                                  onChange={(e) => setMark(i, c.key, e.target.value)}
                                  onKeyDown={(e) => onKey(e, at)}
                                />
                              </label>
                            );
                          })}
                        </div>
                      </td>
                      <td className="mono">{empty ? "—" : `${total}/${p.totalMarks}`}</td>
                      <td>
                        {p.absent ? (
                          <span className="ec-grade f">ABS</span>
                        ) : empty ? (
                          "—"
                        ) : (
                          <span className={`ec-grade${total < p.passingMarks ? " f" : ""}`}>{gradeOf(pct)}</span>
                        )}
                      </td>
                      <td>
                        <input type="checkbox" checked={p.absent} onChange={(e) => update(i, { absent: e.target.checked })} />
                      </td>
                      <td>
                        <input className={inputClass} value={p.remarks} onChange={(e) => update(i, { remarks: e.target.value })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>Grand total</b></td>
                  <td />
                  <td className="mono"><b>{grand.got}/{grand.max}</b></td>
                  <td>{grand.max ? <span className="ec-grade">{gradeOf((grand.got / grand.max) * 100)}</span> : null}</td>
                  <td colSpan={2} style={hint}>{grand.max ? `${Math.round((grand.got / grand.max) * 1000) / 10}%` : ""}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {sheet.final ? <ReasonBox value={reason} onChange={setReason} /> : null}
          <div className="form-actions ec-sticky">
            <button type="button" className="btn-dark" disabled={busy} onClick={() => save("next")}>
              {busy ? "Saving…" : index < students.length - 1 ? "Save & next student" : "Save marks"}
            </button>
            {index < students.length - 1 ? (
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => save()}>
                Save
              </button>
            ) : null}
            {dirty ? <span style={{ ...hint, marginTop: 0 }}>Unsaved changes</span> : null}
            <span style={{ ...hint, marginTop: 0 }}>Tip: press Enter to jump to the next mark box.</span>
          </div>
        </Panel>
      ) : sheet && !students.length ? (
        <EmptyState message="No active students in this class." />
      ) : null}
    </div>
  );
}

function SubjectMarks({ termId, overview, reload }: { termId: string; overview: Overview | null; reload: () => void }) {
  const classes = overview?.classes || [];
  const [reason, setReason] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [sheet, setSheet] = useState<MarksSheet | null>(null);
  const [rows, setRows] = useState<SheetStudent[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const cls = classes.find((c) => c.classId === classId);

  const load = useCallback(async () => {
    if (!termId || !classId || !subjectId) return;
    setErr("");
    setMsg("");
    try {
      const data = await call<MarksSheet>(
        `/api/exams/center/marks?termId=${termId}&classId=${classId}&subjectId=${subjectId}`
      );
      setSheet(data);
      setRows(data.students);
      setDirty(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [termId, classId, subjectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    load();
  }, [load]);

  function pick(nextClass: string, nextSubject: string) {
    if (dirty && !confirm("You have unsaved marks. Discard them?")) return;
    setSheet(null);
    setRows([]);
    setClassId(nextClass);
    setSubjectId(nextSubject);
  }

  function setMark(i: number, key: string, value: string) {
    setDirty(true);
    setRows((list) =>
      list.map((r, j) => {
        if (j !== i) return r;
        const marks = { ...r.marks };
        if (value === "") delete marks[key];
        else marks[key] = Number(value);
        return { ...r, marks };
      })
    );
  }

  /** Enter / ↓ moves down the same column, ↑ moves up — fast keyboard entry. */
  function onKey(e: KeyboardEvent<HTMLInputElement>, row: number, col: number) {
    const move = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + move}-${col}"]`);
    next?.focus();
    next?.select();
  }

  async function save() {
    if (!sheet) return;
    setErr("");
    setMsg("");
    const over = rows.find((r) =>
      sheet.components.some((c) => (r.marks[c.key] ?? 0) > c.maxMarks)
    );
    if (over) {
      setErr(`${over.name}: marks are more than the maximum.`);
      return;
    }
    // Students left blank are skipped, so a half-finished sheet never saves zeros for them.
    const filled = rows.filter((r) => r.absent || Object.keys(r.marks).length);
    if (!filled.length) {
      setErr("Enter marks for at least one student.");
      return;
    }
    setBusy(true);
    try {
      await call("/api/exams/center/marks", {
        method: "PUT",
        body: JSON.stringify({
          termId,
          classId,
          subjectId,
          entries: filled.map((r) => ({
            studentId: r._id,
            marks: r.marks,
            absent: r.absent,
            remarks: r.remarks || undefined,
          })),
          reason: reason.trim() || undefined,
        }),
      });
      setReason("");
      const left = rows.length - filled.length;
      setMsg(
        `Marks saved for ${filled.length} student(s) — ${sheet.subject.name}, ${sheet.classLabel}.` +
          (left ? ` ${left} still blank.` : "")
      );
      setDirty(false);
      reload();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!termId) return <EmptyState message="Select an exam term above." />;
  if (!classes.length) return <EmptyState message="No date sheet in this term yet — create it in step ① first." />;

  const stats = sheet
    ? (() => {
        const done = rows.filter((r) => r.absent || Object.keys(r.marks).length);
        const totals = rows.filter((r) => !r.absent).map((r) => Object.values(r.marks).reduce((s, v) => s + v, 0));
        return {
          entered: done.length,
          absent: rows.filter((r) => r.absent).length,
          passed: totals.filter((t) => t >= sheet.passingMarks).length,
          avg: totals.length ? Math.round((totals.reduce((s, v) => s + v, 0) / totals.length) * 10) / 10 : 0,
        };
      })()
    : null;

  return (
    <div className="stack-lg">
      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}
      <Panel title="Pick class & paper">
        <div className="form-grid">
          <Field label="Class">
            <select className={inputClass} value={classId} onChange={(e) => pick(e.target.value, "")}>
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.classId} value={c.classId}>
                  {c.classLabel} — {c.marksEntered}/{c.marksExpected} marks entered
                </option>
              ))}
            </select>
          </Field>
        </div>
        {cls ? (
          <div className="ec-papers">
            {cls.subjects.map((s) => {
              const done = s.marksEntered >= cls.students && cls.students > 0;
              return (
                <button
                  key={s._id}
                  type="button"
                  className={`ec-paper${s._id === subjectId ? " on" : ""}${done ? " done" : ""}`}
                  onClick={() => pick(classId, s._id)}
                >
                  <b>{s.name}</b>
                  <small>
                    {prettyDay(s.examDate)} · {s.marksEntered}/{cls.students} {done ? "✓" : ""}
                  </small>
                </button>
              );
            })}
          </div>
        ) : null}
      </Panel>

      {sheet ? (
        <Panel
          title={`${sheet.subject.name} — ${sheet.classLabel}`}
          meta={`MAX ${sheet.totalMarks} · PASS ${sheet.passingMarks}`}
        >
          {stats ? (
            <div className="ec-stats">
              <span>Entered <b>{stats.entered}/{rows.length}</b></span>
              <span>Absent <b>{stats.absent}</b></span>
              <span>Passed <b>{stats.passed}</b></span>
              <span>Average <b>{stats.avg}</b></span>
            </div>
          ) : null}
          <div className="table-scroll">
            <table className="ec-table ec-marks">
              <thead>
                <tr>
                  <th>Roll No</th>
                  <th>Student</th>
                  {sheet.components.map((c) => (
                    <th key={c.key}>
                      {c.label}
                      <small> /{c.maxMarks}</small>
                    </th>
                  ))}
                  <th>Total</th>
                  <th>Grade</th>
                  <th>Absent</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const total = r.absent ? 0 : sheet.components.reduce((s, c) => s + (r.marks[c.key] ?? 0), 0);
                  const empty = !r.absent && !Object.keys(r.marks).length;
                  const pct = sheet.totalMarks ? (total / sheet.totalMarks) * 100 : 0;
                  return (
                    <tr key={r._id} className={r.absent ? "ec-absent" : ""}>
                      <td className="mono">{r.rollNo || "—"}</td>
                      <td>
                        <b>{r.name}</b>
                        <div style={hint}>
                          {r.admissionNo} <Corrected history={r.history} />
                        </div>
                      </td>
                      {sheet.components.map((c, ci) => {
                        const v = r.marks[c.key];
                        return (
                          <td key={c.key}>
                            <input
                              type="number"
                              min={0}
                              max={c.maxMarks}
                              step="0.5"
                              disabled={r.absent}
                              data-cell={`${i}-${ci}`}
                              className={`${inputClass} ec-num${v != null && v > c.maxMarks ? " ec-bad" : ""}`}
                              value={v ?? ""}
                              onChange={(e) => setMark(i, c.key, e.target.value)}
                              onKeyDown={(e) => onKey(e, i, ci)}
                            />
                          </td>
                        );
                      })}
                      <td className="mono">{empty ? "—" : total}</td>
                      <td>
                        {r.absent ? (
                          <span className="ec-grade f">ABS</span>
                        ) : empty ? (
                          "—"
                        ) : (
                          <span className={`ec-grade${total < sheet.passingMarks ? " f" : ""}`}>{gradeOf(pct)}</span>
                        )}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.absent}
                          onChange={(e) => {
                            setDirty(true);
                            setRows((list) => list.map((x, j) => (j === i ? { ...x, absent: e.target.checked } : x)));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className={inputClass}
                          value={r.remarks}
                          onChange={(e) => {
                            setDirty(true);
                            setRows((list) => list.map((x, j) => (j === i ? { ...x, remarks: e.target.value } : x)));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sheet.final ? <ReasonBox value={reason} onChange={setReason} /> : null}
          <div className="form-actions ec-sticky">
            <button type="button" className="btn-dark" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save marks"}
            </button>
            {dirty ? <span style={{ ...hint, marginTop: 0 }}>Unsaved changes</span> : null}
            <span style={{ ...hint, marginTop: 0 }}>Tip: press Enter to jump to the next student.</span>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ---------- Step 4: Result cards ---------- */

type ResultBatch = {
  classId: string;
  classLabel: string;
  stats: { students: number; complete: number; passed: number; failed: number; average: number; highest: number };
  cards: { student: { name: string; rollNo: string }; percent: number; obtained: number; totalMarks: number; position: number; grade: string; result: string }[];
};

type Correction = MarkChange & { student: string; admissionNo: string; classLabel: string; subject: string };

/** Finalise the term's results, or reopen them; and the list of every correction made. */
function FinalPanel({ termId, status, isAdmin, onChanged }: { termId: string; status: string; isAdmin: boolean; onChanged: () => void }) {
  const [list, setList] = useState<Correction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const final = status === "closed";

  const load = useCallback(async () => {
    const d = await call<{ corrections: Correction[] }>(`/api/exams/center/corrections?termId=${termId}`).catch(() => ({ corrections: [] }));
    setList(d.corrections);
  }, [termId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    load();
  }, [load]);

  async function toggle() {
    const ask = final
      ? "Reopen results? Marks can then be changed without a reason (changes are still kept in the history)."
      : "Finalise results? After this, every change to marks needs a reason and is kept in the correction history.";
    if (!confirm(ask)) return;
    setBusy(true);
    setErr("");
    try {
      await call("/api/exams/center/corrections", { method: "PUT", body: JSON.stringify({ termId, final: !final }) });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Final results & corrections" meta={final ? "FINAL" : "OPEN FOR ENTRY"}>
      {err ? <div className="alert err">{err}</div> : null}
      <div className="form-actions" style={{ marginTop: 0, alignItems: "center" }}>
        {isAdmin ? (
          <button type="button" className={final ? "btn-ghost" : "btn-dark"} disabled={busy} onClick={toggle}>
            {final ? "Reopen results" : "Finalise results"}
          </button>
        ) : null}
        <span style={{ ...hint, marginTop: 0 }}>
          {final
            ? "Results are final: teachers can still correct mistakes, with a reason."
            : "Finalise once all marks are checked — later changes then need a reason."}
        </span>
      </div>
      {!list ? null : !list.length ? (
        <p style={hint}>No corrections yet. Every change to marks already entered is listed here.</p>
      ) : (
        <div className="table-scroll">
          <table className="ec-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Student</th>
                <th>Class · Paper</th>
                <th>Marks</th>
                <th>By</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c, i) => (
                <tr key={i}>
                  <td className="mono">{new Date(c.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td>
                    <b>{c.student}</b>
                    <div style={hint}>{c.admissionNo}</div>
                  </td>
                  <td>{c.classLabel} · {c.subject}</td>
                  <td className="mono">{c.from} → {c.to}</td>
                  <td>{c.by || "—"}</td>
                  <td>{c.reason || <span style={hint}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ResultsStep({ termId, overview, isAdmin, reload }: { termId: string; overview: Overview | null; isAdmin: boolean; reload: () => void }) {
  const classes = overview?.classes || [];
  const [selected, setSelected] = useState<string[]>([]);
  const [batches, setBatches] = useState<ResultBatch[] | null>(null);
  const [err, setErr] = useState("");

  async function show() {
    setErr("");
    try {
      const data = await call<{ batches: ResultBatch[] }>(
        `/api/exams/center/results?termId=${termId}&classIds=${selected.join(",")}`
      );
      setBatches(data.batches);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!termId) return <EmptyState message="Select an exam term above." />;
  if (!classes.length) return <EmptyState message="No date sheet in this term yet — create it in step ① first." />;

  const q = `termId=${termId}&classIds=${selected.join(",")}`;
  return (
    <div className="stack-lg">
      {err ? <div className="alert err">{err}</div> : null}
      {overview ? <FinalPanel termId={termId} status={overview.term.status} isAdmin={isAdmin} onChanged={reload} /> : null}
      <Panel title="Classes" meta="RESULT CARDS">
        <ClassChecklist
          classes={classes.map((c) => ({
            id: c.classId,
            label: c.classLabel,
            note: `${c.marksExpected ? Math.round((c.marksEntered / c.marksExpected) * 100) : 0}% marks entered`,
          }))}
          selected={selected}
          onChange={(ids) => {
            setSelected(ids);
            setBatches(null);
          }}
        />
        <div className="form-actions">
          <button type="button" className="btn-dark" disabled={!selected.length} onClick={show}>
            Show results
          </button>
          <button type="button" className="btn-ghost" disabled={!selected.length} onClick={() => openPrint(`/print/result-cards?${q}`)}>
            Print result cards
          </button>
          <button type="button" className="btn-ghost" disabled={!selected.length} onClick={() => openPrint(`/print/result-sheet?${q}`)}>
            Print class result sheet
          </button>
          <a
            className={`wa-btn${selected.length ? "" : " disabled"}`}
            href={selected.length ? `/messages?kind=result&termId=${termId}&classIds=${selected.join(",")}` : undefined}
          >
            Send results on WhatsApp
          </a>
        </div>
      </Panel>
      {batches?.map((b) => {
        const top = b.cards.filter((c) => c.position).sort((x, y) => x.position - y.position).slice(0, 5);
        return (
          <Panel key={b.classId} title={b.classLabel} meta={`${b.stats.students} STUDENTS`}>
            <div className="ec-stats">
              <span>Complete <b>{b.stats.complete}/{b.stats.students}</b></span>
              <span>Passed <b>{b.stats.passed}</b></span>
              <span>Failed <b>{b.stats.failed}</b></span>
              <span>Pass % <b>{b.stats.complete ? Math.round((b.stats.passed / b.stats.complete) * 100) : 0}%</b></span>
              <span>Class average <b>{b.stats.average}%</b></span>
              <span>Highest <b>{b.stats.highest}%</b></span>
            </div>
            {b.stats.complete < b.stats.students ? (
              <div className="alert err">
                {b.stats.students - b.stats.complete} student(s) still have papers without marks — their card shows them as pending.
              </div>
            ) : null}
            {top.length ? (
              <table className="ec-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Roll No</th>
                    <th>Student</th>
                    <th>Marks</th>
                    <th>%</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((c) => (
                    <tr key={c.student.rollNo + c.student.name}>
                      <td><b>{c.position}</b></td>
                      <td className="mono">{c.student.rollNo}</td>
                      <td>{c.student.name}</td>
                      <td className="mono">{c.obtained}/{c.totalMarks}</td>
                      <td className="mono">{c.percent}%</td>
                      <td><span className="ec-grade">{c.grade}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}

/* ---------- Exam Center shell ---------- */

export type ExamStep = "datesheet" | "slips" | "marks" | "results";

const STEPS: { key: ExamStep; label: string; sub: string }[] = [
  { key: "datesheet", label: "Date Sheet", sub: "Classes → subjects → dates" },
  { key: "slips", label: "Roll No Slips", sub: "Roll numbers & print" },
  { key: "marks", label: "Marks Entry", sub: "Theory, practical, viva…" },
  { key: "results", label: "Result Cards", sub: "Cards, positions, sheet" },
];

export function ExamCenter({ step, onStep, role }: { step: ExamStep; onStep: (s: ExamStep) => void; role: string }) {
  const isAdmin = role === "admin";
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [termId, setTermId] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);

  const loadTerms = useCallback(async () => {
    const data = await call<{ terms: TermOption[] }>("/api/exams/terms").catch(() => ({ terms: [] }));
    setTerms(data.terms);
    setTermId((current) => current || data.terms.find((t) => t.status === "active")?._id || data.terms[0]?._id || "");
  }, []);

  const loadOverview = useCallback(async () => {
    if (!termId) return setOverview(null);
    const data = await call<Overview>(`/api/exams/center/overview?termId=${termId}`).catch(() => null);
    setOverview(data);
  }, [termId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    loadTerms();
  }, [loadTerms]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    loadOverview();
  }, [loadOverview]);

  const term = useMemo(() => terms.find((t) => t._id === termId), [terms, termId]);
  const visibleSteps = isAdmin ? STEPS : STEPS.filter((s) => s.key !== "datesheet");

  return (
    <div className="stack-lg">
      <div className="ec-steps">
        {visibleSteps.map((s, i) => (
          <Fragment key={s.key}>
            <button type="button" className={`ec-step${step === s.key ? " on" : ""}`} onClick={() => onStep(s.key)}>
              <span className="ec-step-n">{i + 1}</span>
              <span>
                <b>{s.label}</b>
                <small>{s.sub}</small>
              </span>
            </button>
          </Fragment>
        ))}
      </div>

      <Panel>
        <TermPicker terms={terms} termId={termId} onChange={setTermId} onCreated={loadTerms} canCreate={isAdmin} />
        {overview?.classes.length ? (
          <div style={hint}>
            {overview.classes.length} class(es) have a date sheet in this term ·{" "}
            {overview.classes.reduce((s, c) => s + c.students, 0)} students
          </div>
        ) : null}
      </Panel>

      {step === "datesheet" && isAdmin ? (
        <DateSheetStep termId={termId} term={term} onSaved={loadOverview} />
      ) : null}
      {step === "slips" ? <SlipsStep termId={termId} overview={overview} isAdmin={isAdmin} reload={loadOverview} /> : null}
      {step === "marks" ? <MarksStep termId={termId} overview={overview} reload={loadOverview} /> : null}
      {step === "results" ? <ResultsStep termId={termId} overview={overview} isAdmin={isAdmin} reload={loadOverview} /> : null}
    </div>
  );
}
