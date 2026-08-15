"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Field, Hero, Panel, StatusBadge, inputClass } from "@/components/ui";
import { DEFAULT_THEME, THEME_PRESETS, themeVars, type Theme } from "@/lib/theme";
import { prettyDate } from "@/lib/types";

type Branch = { code: string; name: string; address?: string; phone?: string };

type AcademicSession = {
  _id: string;
  name: string;
  code: string;
  status: "draft" | "active" | "closed";
  startDate?: string;
  endDate?: string;
  notes?: string;
  classCount?: number;
  activatedAt?: string;
  closedAt?: string;
};

type Settings = {
  schoolName: string;
  registrationNo?: string;
  academicYear: string;
  feeDueDay: number;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  smsFeeReminders: boolean;
  whatsappAttendance: boolean;
  emailResults: boolean;
  taxEnabled: boolean;
  taxName: string;
  taxRate: number;
  taxInclusive: boolean;
  defaultBranchCode: string;
  branches: Branch[];
  theme: Theme;
};

function suggestNextYear(current: string) {
  const match = current.match(/(\d{4})\D+(\d{2,4})/);
  if (match) {
    const start = Number(match[1]) + 1;
    const endRaw = match[2];
    const end =
      endRaw.length === 2
        ? String((Number(endRaw) + 1) % 100).padStart(2, "0")
        : String(Number(endRaw) + 1);
    return `${start}–${end}`;
  }
  const y = new Date().getFullYear() + 1;
  return `${y}–${String(y + 1).slice(-2)}`;
}

const empty: Settings = {
  schoolName: "Sabaq Model School",
  academicYear: "2026–27",
  feeDueDay: 25,
  currency: "PKR",
  smsFeeReminders: true,
  whatsappAttendance: true,
  emailResults: false,
  taxEnabled: false,
  taxName: "GST",
  taxRate: 0,
  taxInclusive: true,
  defaultBranchCode: "MAIN",
  branches: [{ code: "MAIN", name: "Main Campus" }],
  theme: DEFAULT_THEME,
};

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="color-row">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <input
          className={inputClass}
          value={value.toUpperCase()}
          onChange={(e) => {
            const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            if (/^#[0-9a-fA-F]{0,6}$/.test(next)) onChange(next);
          }}
        />
      </div>
    </Field>
  );
}

export default function SettingsPage() {
  const [form, setForm] = useState<Settings>(empty);
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<
    "profile" | "sessions" | "appearance" | "finance" | "branches" | "notify"
  >("profile");
  const [newBranch, setNewBranch] = useState({ code: "", name: "", address: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    notes: "",
    activate: true,
    copyClassesFrom: "",
  });

  const load = useCallback(async () => {
    const d = await fetch("/api/settings").then((r) => r.json());
    if (d.settings) {
      setForm({
        ...empty,
        ...d.settings,
        branches: d.settings.branches?.length ? d.settings.branches : empty.branches,
        theme: { ...DEFAULT_THEME, ...(d.settings.theme || {}) },
      });
    }
    const list: AcademicSession[] = d.sessions || [];
    setSessions(list);
    const active = list.find((s) => s.status === "active");
    setSessionForm((f) => ({
      ...f,
      name: f.name || suggestNextYear(active?.name || d.settings?.academicYear || empty.academicYear),
      copyClassesFrom: f.copyClassesFrom || active?._id || "",
    }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live preview: inline variables win over the server-rendered theme style tag.
  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVars(form.theme);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  }, [form.theme]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (tab === "sessions") return;
    setMsg("");
    setErr("");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Save failed");
      return;
    }
    setForm({
      ...empty,
      ...data.settings,
      theme: { ...DEFAULT_THEME, ...(data.settings.theme || {}) },
    });
    setMsg("Settings saved — theme, tax, branches and profile apply across the system.");
  }

  function setTheme(patch: Partial<Theme>) {
    setForm((current) => ({ ...current, theme: { ...current.theme, ...patch } }));
  }

  async function createSession() {
    setBusy(true);
    setMsg("");
    setErr("");
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sessionForm.name,
        startDate: sessionForm.startDate || null,
        endDate: sessionForm.endDate || null,
        notes: sessionForm.notes || undefined,
        activate: sessionForm.activate,
        copyClassesFrom: sessionForm.copyClassesFrom || null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Could not create session");
      return;
    }
    const copied = data.classesCopied ? ` · ${data.classesCopied} classes copied` : "";
    setMsg(
      sessionForm.activate
        ? `Session ${data.session?.name || sessionForm.name} is now active${copied}.`
        : `Draft session created${copied}.`
    );
    setSessionForm((f) => ({ ...f, name: "", notes: "", startDate: "", endDate: "" }));
    await load();
  }

  async function sessionAction(
    id: string,
    action: "activate" | "close" | "reopen",
    copyFrom?: string
  ) {
    setBusy(true);
    setMsg("");
    setErr("");
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        copyClassesFrom: action === "activate" ? copyFrom || null : null,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Action failed");
      return;
    }
    const copied = data.classesCopied ? ` · ${data.classesCopied} classes copied` : "";
    setMsg(
      action === "activate"
        ? `Session activated${copied}. Previous active year was closed.`
        : action === "close"
          ? "Session archived as closed."
          : "Session reopened as draft."
    );
    await load();
  }

  async function removeSession(id: string) {
    if (!confirm("Delete this session?")) return;
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Could not delete");
      return;
    }
    setMsg("Session deleted.");
    await load();
  }

  function addBranch() {
    if (!newBranch.code.trim() || !newBranch.name.trim()) return;
    const code = newBranch.code.toUpperCase().trim();
    if (form.branches.some((b) => b.code === code)) {
      setErr("Branch code already exists");
      return;
    }
    setForm({
      ...form,
      branches: [...form.branches, { ...newBranch, code }],
      defaultBranchCode: form.defaultBranchCode || code,
    });
    setNewBranch({ code: "", name: "", address: "", phone: "" });
    setErr("");
  }

  function removeBranch(code: string) {
    if (form.branches.length <= 1) {
      setErr("Keep at least one branch");
      return;
    }
    const branches = form.branches.filter((b) => b.code !== code);
    setForm({
      ...form,
      branches,
      defaultBranchCode:
        form.defaultBranchCode === code ? branches[0].code : form.defaultBranchCode,
    });
  }

  const active = sessions.find((s) => s.status === "active");

  return (
    <>
      <Hero
        title="Settings"
        subtitle={
          active
            ? `Active session ${active.name} · school profile, tax & branches`
            : "School profile, sessions, tax, branches & integrations"
        }
      />
      <Panel>
        <div className="tabs">
          {(
            [
              ["profile", "School Profile"],
              ["sessions", "Year / Sessions"],
              ["appearance", "Appearance"],
              ["finance", "Tax & Finance"],
              ["branches", "Branches"],
              ["notify", "Notifications"],
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
        {err ? <div className="alert err">{err}</div> : null}
        {msg ? <div className="alert ok">{msg}</div> : null}
        <form onSubmit={save}>
          {tab === "profile" ? (
            <div className="form-grid">
              <Field label="School Name" required>
                <input className={inputClass} value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} required />
              </Field>
              <Field label="Registration No.">
                <input className={inputClass} value={form.registrationNo || ""} onChange={(e) => setForm({ ...form, registrationNo: e.target.value })} />
              </Field>
              <Field label="Active Academic Year">
                <input className={inputClass} value={form.academicYear} readOnly />
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                  Managed under Year / Sessions — activate a session to change this.
                </div>
              </Field>
              <Field label="Fee Due Day">
                <input type="number" className={inputClass} value={form.feeDueDay} onChange={(e) => setForm({ ...form, feeDueDay: Number(e.target.value) })} />
              </Field>
              <Field label="Phone">
                <input className={inputClass} value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </Field>
              <Field label="Email">
                <input type="email" className={inputClass} value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </Field>
              <Field label="Currency">
                <input className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </Field>
              <Field label="Address">
                <input className={inputClass} value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
            </div>
          ) : null}

          {tab === "sessions" ? (
            <>
              <div className="form-section-title">Open a new session</div>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-dim)" }}>
                Create the next academic year as a draft, or activate it immediately. Activating
                closes the current year and can copy all class sections (without students) into the
                new session.
              </p>
              <div className="form-grid">
                <Field label="Session name" required>
                  <input
                    className={inputClass}
                    value={sessionForm.name}
                    onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                    placeholder="e.g. 2027–28"
                  />
                </Field>
                <Field label="Start date">
                  <input
                    type="date"
                    className={inputClass}
                    value={sessionForm.startDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, startDate: e.target.value })}
                  />
                </Field>
                <Field label="End date">
                  <input
                    type="date"
                    className={inputClass}
                    value={sessionForm.endDate}
                    onChange={(e) => setSessionForm({ ...sessionForm, endDate: e.target.value })}
                  />
                </Field>
                <Field label="Copy classes from">
                  <select
                    className={inputClass}
                    value={sessionForm.copyClassesFrom}
                    onChange={(e) =>
                      setSessionForm({ ...sessionForm, copyClassesFrom: e.target.value })
                    }
                  >
                    <option value="">Do not copy</option>
                    {sessions.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.classCount ?? 0} classes)
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Notes">
                  <input
                    className={inputClass}
                    value={sessionForm.notes}
                    onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                    placeholder="Optional"
                  />
                </Field>
                <Field label="On create">
                  <select
                    className={inputClass}
                    value={sessionForm.activate ? "activate" : "draft"}
                    onChange={(e) =>
                      setSessionForm({ ...sessionForm, activate: e.target.value === "activate" })
                    }
                  >
                    <option value="activate">Activate immediately (closes current)</option>
                    <option value="draft">Save as draft</option>
                  </select>
                </Field>
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: 14 }}
                disabled={busy || !sessionForm.name.trim()}
                onClick={createSession}
              >
                {busy
                  ? "Working…"
                  : sessionForm.activate
                    ? "Create & Activate Session"
                    : "Create Draft Session"}
              </button>

              <div className="form-section-title" style={{ marginTop: 28 }}>
                All sessions
              </div>
              {!sessions.length ? (
                <div className="empty">
                  No sessions yet — one will be created from your school profile.
                </div>
              ) : (
                <div className="session-list">
                  {sessions.map((s) => (
                    <div
                      className={`session-row${s.status === "active" ? " active" : ""}`}
                      key={s._id}
                    >
                      <div>
                        <div className="dname">
                          {s.name}{" "}
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 10,
                              color: "var(--text-dim)",
                            }}
                          >
                            {s.code}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 3 }}>
                          {s.classCount ?? 0} classes
                          {s.startDate ? ` · ${prettyDate(s.startDate)}` : ""}
                          {s.endDate ? ` – ${prettyDate(s.endDate)}` : ""}
                          {s.status === "active" && s.activatedAt
                            ? ` · activated ${prettyDate(s.activatedAt)}`
                            : ""}
                          {s.status === "closed" && s.closedAt
                            ? ` · closed ${prettyDate(s.closedAt)}`
                            : ""}
                        </div>
                      </div>
                      <div className="session-actions">
                        <StatusBadge status={s.status} />
                        {s.status === "draft" ? (
                          <>
                            <button
                              type="button"
                              className="link-btn"
                              disabled={busy}
                              onClick={() => sessionAction(s._id, "activate", active?._id)}
                            >
                              Activate
                            </button>
                            <button
                              type="button"
                              className="link-btn"
                              disabled={busy}
                              onClick={() => sessionAction(s._id, "close")}
                            >
                              Archive
                            </button>
                            <button
                              type="button"
                              className="link-btn danger"
                              disabled={busy}
                              onClick={() => removeSession(s._id)}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                        {s.status === "closed" ? (
                          <button
                            type="button"
                            className="link-btn"
                            disabled={busy}
                            onClick={() => sessionAction(s._id, "reopen")}
                          >
                            Reopen draft
                          </button>
                        ) : null}
                        {s.status === "active" ? (
                          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            Current year
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {tab === "appearance" ? (
            <>
              <div className="form-section-title">Colour Themes</div>
              <div className="theme-presets">
                {THEME_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={`theme-card${form.theme.preset === preset.key ? " active" : ""}`}
                    onClick={() =>
                      setTheme({
                        preset: preset.key,
                        primary: preset.primary,
                        accent: preset.accent,
                        sidebar: preset.sidebar,
                        surface: preset.surface,
                      })
                    }
                  >
                    <span className="theme-swatches">
                      <i style={{ background: preset.sidebar }} />
                      <i style={{ background: preset.primary }} />
                      <i style={{ background: preset.accent }} />
                      <i style={{ background: preset.surface }} />
                    </span>
                    <strong>{preset.name}</strong>
                    <small>{preset.primary.toUpperCase()}</small>
                  </button>
                ))}
              </div>

              <div className="form-section-title" style={{ marginTop: 22 }}>
                Custom Colours
              </div>
              <div className="form-grid">
                <ColorField
                  label="Primary (buttons, hero, active)"
                  value={form.theme.primary}
                  onChange={(primary) => setTheme({ primary, preset: "custom" })}
                />
                <ColorField
                  label="Accent (badges, avatar)"
                  value={form.theme.accent}
                  onChange={(accent) => setTheme({ accent, preset: "custom" })}
                />
                <ColorField
                  label="Sidebar"
                  value={form.theme.sidebar}
                  onChange={(sidebar) => setTheme({ sidebar, preset: "custom" })}
                />
                <ColorField
                  label="Page background"
                  value={form.theme.surface}
                  onChange={(surface) => setTheme({ surface, preset: "custom" })}
                />
                <Field label="Fill style">
                  <select
                    className={inputClass}
                    value={form.theme.solid ? "solid" : "gradient"}
                    onChange={(e) => setTheme({ solid: e.target.value === "solid" })}
                  >
                    <option value="solid">Solid colour (flat)</option>
                    <option value="gradient">Gradient shading</option>
                  </select>
                </Field>
                <Field label={`Corner radius — ${form.theme.radius}px`}>
                  <input
                    type="range"
                    min={0}
                    max={28}
                    value={form.theme.radius}
                    onChange={(e) => setTheme({ radius: Number(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </Field>
              </div>

              <div className="form-section-title" style={{ marginTop: 22 }}>
                Live Preview
              </div>
              <div className="theme-preview">
                <div className="theme-preview-side">
                  <span className="theme-preview-badge">S</span>
                  <b>{form.schoolName}</b>
                  <em>Dashboard</em>
                  <em className="on">Students</em>
                  <em>Accounting</em>
                </div>
                <div className="theme-preview-body">
                  <div className="theme-preview-hero">
                    <strong>Hero banner</strong>
                    <span>Primary surface across every page</span>
                  </div>
                  <div className="theme-preview-actions">
                    <span className="btn-dark">Primary button</span>
                    <span className="badge present">Active</span>
                    <span className="badge leave">Pending</span>
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 12 }}>
                Changes preview instantly. Save to apply them for every user on the dashboard,
                login screen and public website.
              </p>
            </>
          ) : null}

          {tab === "finance" ? (
            <div className="form-grid">
              <Field label="Enable tax on ledger posts">
                <select
                  className={inputClass}
                  value={form.taxEnabled ? "yes" : "no"}
                  onChange={(e) => setForm({ ...form, taxEnabled: e.target.value === "yes" })}
                >
                  <option value="no">Off</option>
                  <option value="yes">On — apply to fees, distance learning & store</option>
                </select>
              </Field>
              <Field label="Tax name">
                <input className={inputClass} value={form.taxName} onChange={(e) => setForm({ ...form, taxName: e.target.value })} placeholder="GST / VAT" />
              </Field>
              <Field label="Tax rate %">
                <input
                  type="number"
                  className={inputClass}
                  value={form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}
                />
              </Field>
              <Field label="Tax mode">
                <select
                  className={inputClass}
                  value={form.taxInclusive ? "inclusive" : "exclusive"}
                  onChange={(e) => setForm({ ...form, taxInclusive: e.target.value === "inclusive" })}
                >
                  <option value="inclusive">Inclusive (tax inside amount)</option>
                  <option value="exclusive">Exclusive (tax added on top)</option>
                </select>
              </Field>
              <div className="form-grid one" style={{ gridColumn: "1 / -1" }}>
                <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>
                  When fees, inventory, or distance enrollments post to Accounting, tax is calculated from these settings.
                  Paid payslips post as payroll expense (no tax). All modules share one ledger.
                </p>
              </div>
            </div>
          ) : null}

          {tab === "branches" ? (
            <>
              <Field label="Default branch">
                <select
                  className={inputClass}
                  value={form.defaultBranchCode}
                  onChange={(e) => setForm({ ...form, defaultBranchCode: e.target.value })}
                >
                  {form.branches.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div style={{ marginTop: 16 }}>
                {form.branches.map((b) => (
                  <div className="deadline-row" key={b.code}>
                    <div>
                      <div className="dname">
                        {b.name} <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>({b.code})</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                        {[b.address, b.phone].filter(Boolean).join(" · ") || "No address"}
                      </div>
                    </div>
                    <button type="button" className="link-btn danger" onClick={() => removeBranch(b.code)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="form-grid" style={{ marginTop: 16 }}>
                <Field label="Code">
                  <input className={inputClass} value={newBranch.code} onChange={(e) => setNewBranch({ ...newBranch, code: e.target.value })} placeholder="EAST" />
                </Field>
                <Field label="Name">
                  <input className={inputClass} value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} placeholder="East Campus" />
                </Field>
                <Field label="Address">
                  <input className={inputClass} value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <input className={inputClass} value={newBranch.phone} onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })} />
                </Field>
              </div>
              <button type="button" className="btn-dark" style={{ marginTop: 12 }} onClick={addBranch}>
                Add Branch
              </button>
            </>
          ) : null}

          {tab === "notify" ? (
            <div>
              {(
                [
                  { key: "smsFeeReminders" as const, title: "SMS fee reminders", desc: "Send SMS 3 days before due date" },
                  { key: "whatsappAttendance" as const, title: "WhatsApp attendance alerts", desc: "Notify parents when marked absent" },
                  { key: "emailResults" as const, title: "Exam result emails", desc: "Email report cards when published" },
                ] as const
              ).map((row) => (
                <div
                  className="deadline-row"
                  key={row.key}
                  style={{ cursor: "pointer" }}
                  onClick={() => setForm({ ...form, [row.key]: !form[row.key] })}
                >
                  <div>
                    <div className="dname">{row.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{row.desc}</div>
                  </div>
                  <div
                    style={{
                      width: 42,
                      height: 24,
                      borderRadius: 20,
                      background: form[row.key] ? "var(--jade)" : "var(--line)",
                      position: "relative",
                      transition: "0.2s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 3,
                        left: form[row.key] ? 22 : 3,
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        transition: "0.2s",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab !== "sessions" ? (
            <div style={{ marginTop: 22 }}>
              <button type="submit" className="btn-dark">
                Save Settings
              </button>
            </div>
          ) : null}
        </form>
      </Panel>
    </>
  );
}
