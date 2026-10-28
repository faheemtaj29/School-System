"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, Panel, StatusBadge, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";

type Kind = "absence" | "fee" | "result" | "custom";
type Tab = Kind | "log" | "settings";
type Row = { studentId: string; student: string; parent: string; className: string; phone: string; text: string; waLink: string | null };
type ClassOpt = { _id: string; name: string; section?: string };
type Config = {
  provider: "none" | "twilio" | "http";
  channel: "sms" | "whatsapp";
  countryCode: string;
  twilioSid?: string;
  twilioFrom?: string;
  httpMethod?: "GET" | "POST";
  hasTwilioToken: boolean;
  httpUrlHost: string;
  templates: { absence: string; fee: string; result: string };
  defaults: { absence: string; fee: string; result: string };
};
type LogRow = {
  _id: string;
  createdAt: string;
  kind: Kind;
  to: string;
  recipientName?: string;
  text: string;
  channel: string;
  status: string;
  error?: string;
  studentId?: { firstName: string; lastName: string } | null;
  sentBy?: { name: string } | null;
};

const TAB_LABEL: Record<Tab, string> = {
  absence: "Absences",
  fee: "Fee reminders",
  result: "Results ready",
  custom: "Custom message",
  log: "Sent log",
  settings: "Settings",
};
const PLACEHOLDERS: Record<Kind, string> = {
  absence: "{parent} {student} {class} {date} {school}",
  fee: "{parent} {student} {class} {amount} {currency} {dueDate} {status} {school}",
  result: "{parent} {student} {class} {term} {obtained} {total} {percent} {grade} {result} {position} {school}",
  custom: "{parent} {student} {class} {school}",
};

/** Messages to parents — absences, fee dues, results and notices — by WhatsApp or SMS. */
export default function MessagesPage() {
  const [role, setRole] = useState("");
  const [tab, setTab] = useState<Tab>("absence");
  const [config, setConfig] = useState<Config | null>(null);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [terms, setTerms] = useState<{ _id: string; name: string; academicYear?: string }[]>([]);
  // filters
  const [date, setDate] = useState(toDateInput(new Date()));
  const [classIds, setClassIds] = useState<string[]>([]);
  const [feeScope, setFeeScope] = useState<"unpaid" | "overdue" | "due_soon">("unpaid");
  const [days, setDays] = useState(3);
  const [termId, setTermId] = useState("");
  const [text, setText] = useState("");
  // list
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setRole(d.user?.role || ""));
    fetch("/api/messages?view=config").then((r) => r.json()).then((d) => setConfig(d.config || null));
    fetch("/api/messages?view=classes").then((r) => r.json()).then((d) => setClasses(d.classes || []));
    fetch("/api/exams/terms").then((r) => r.json()).then((d) => {
      setTerms(d.terms || []);
      setTermId((t) => t || d.terms?.[0]?._id || "");
    }).catch(() => {});
    // Opened from Attendance: /messages?kind=absence&date=…&classIds=…
    const q = new URLSearchParams(window.location.search);
    const k = q.get("kind") as Kind | null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL
    if (k && ["absence", "fee", "result", "custom"].includes(k)) setTab(k);
    if (q.get("date")) setDate(q.get("date")!);
    if (q.get("classIds")) setClassIds(q.get("classIds")!.split(",").filter(Boolean));
  }, []);

  const kind: Kind | null = ["absence", "fee", "result", "custom"].includes(tab) ? (tab as Kind) : null;
  const filters = useMemo(
    () => ({ kind, date, classIds, feeScope, dueWithinDays: days, termId, text }),
    [kind, date, classIds, feeScope, days, termId, text]
  );

  const loadLog = useCallback(() => {
    fetch("/api/messages?view=log").then((r) => r.json()).then((d) => setLog(d.log || []));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the list when the tab changes
    setRows(null);
    setMsg(null);
    setDone({});
    if (tab === "log") loadLog();
  }, [tab, loadLog]);

  async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...filters, ...body }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Something went wrong");
    return d;
  }

  async function prepare() {
    setBusy(true);
    setMsg(null);
    setDone({});
    try {
      const d = await call({ action: "prepare" });
      setRows(d.rows);
      setPicked(new Set(d.rows.filter((r: Row) => r.phone).map((r: Row) => r.studentId)));
      if (!d.rows.length) setMsg({ ok: true, text: "Nobody to message for this selection." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function sendAll() {
    if (!picked.size) return;
    if (!confirm(`Send ${picked.size} message(s) now?`)) return;
    setBusy(true);
    try {
      const d = await call({ action: "send", studentIds: [...picked] });
      setDone(Object.fromEntries(d.results.map((r: { studentId: string; status: string }) => [r.studentId, r.status])));
      setMsg({ ok: !d.failed, text: `Sent ${d.sent}${d.failed ? ` · ${d.failed} failed (see Sent log)` : ""}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  /** WhatsApp click-to-send: open the chat with the message ready, and record it. */
  async function openWhatsApp(r: Row) {
    if (!r.waLink) return;
    window.open(r.waLink, "_blank", "noopener");
    setDone((d) => ({ ...d, [r.studentId]: "opened" }));
    call({ action: "send", studentIds: [r.studentId], manual: true }).catch(() => {});
  }

  async function saveConfig(patch: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch("/api/messages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: d.error || "Could not save" });
    setConfig(d.config);
    setMsg({ ok: true, text: "Saved." });
  }

  const gateway = config && config.provider !== "none";
  const tabs: Tab[] =
    role === "teacher" ? ["absence"] : role === "admin" ? ["absence", "fee", "result", "custom", "log", "settings"] : ["absence", "fee", "result", "custom", "log"];

  return (
    <>
      <Hero
        title="Parent Messages"
        subtitle={
          gateway
            ? `Sending by ${config!.channel === "whatsapp" ? "WhatsApp" : "SMS"} through your gateway`
            : "Each message opens WhatsApp ready to send — add an SMS / WhatsApp gateway in Settings to send all at once"
        }
      />

      <div className="chips no-print" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button key={t} type="button" className={`filter-chip${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

      {kind ? (
        <Panel title={TAB_LABEL[kind]} meta={rows ? `${rows.length} PARENTS` : "CHOOSE WHO"}>
          <div className="pl-filters">
            {kind === "absence" ? (
              <label>
                <span>Date</span>
                <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            ) : null}
            {kind === "fee" ? (
              <>
                <label>
                  <span>Who</span>
                  <select className={inputClass} value={feeScope} onChange={(e) => setFeeScope(e.target.value as typeof feeScope)}>
                    <option value="unpaid">Everyone with fee unpaid</option>
                    <option value="overdue">Only overdue (past due date)</option>
                    <option value="due_soon">Due within the next days</option>
                  </select>
                </label>
                {feeScope === "due_soon" ? (
                  <label>
                    <span>Days</span>
                    <input type="number" min={1} max={60} className={inputClass} style={{ width: 90 }} value={days} onChange={(e) => setDays(Number(e.target.value) || 3)} />
                  </label>
                ) : null}
              </>
            ) : null}
            {kind === "result" ? (
              <label>
                <span>Exam term</span>
                <select className={inputClass} value={termId} onChange={(e) => setTermId(e.target.value)}>
                  {terms.map((t) => (
                    <option key={t._id} value={t._id}>{t.name}{t.academicYear ? ` · ${t.academicYear}` : ""}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <button type="button" className="btn-dark" disabled={busy || (kind === "result" && !classIds.length)} onClick={prepare}>
              {busy ? "Working…" : "Prepare list"}
            </button>
          </div>

          <div className="chips" style={{ margin: "4px 0 12px" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
              {kind === "result" ? "Classes (choose at least one):" : "Classes (none = all):"}
            </span>
            {classes.map((c) => {
              const on = classIds.includes(c._id);
              return (
                <button
                  key={c._id}
                  type="button"
                  className={`filter-chip${on ? " active" : ""}`}
                  onClick={() => setClassIds((ids) => (on ? ids.filter((x) => x !== c._id) : [...ids, c._id]))}
                >
                  {c.name}{c.section ? `-${c.section}` : ""}
                </button>
              );
            })}
          </div>

          {kind === "custom" ? (
            <label className="msg-text">
              <span>Message — you can use {PLACEHOLDERS.custom}</span>
              <textarea className={inputClass} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dear {parent}, school will remain closed on Friday for…" />
            </label>
          ) : null}

          {rows && rows.length ? (
            <>
              <div className="chips" style={{ margin: "12px 0", alignItems: "center" }}>
                <button type="button" className="filter-chip" onClick={() => setPicked(new Set(rows.filter((r) => r.phone).map((r) => r.studentId)))}>Select all</button>
                <button type="button" className="filter-chip" onClick={() => setPicked(new Set())}>Select none</button>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {picked.size} selected · {rows.filter((r) => !r.phone).length} without a parent phone
                </span>
                {gateway ? (
                  <button type="button" className="btn-dark" disabled={busy || !picked.size} onClick={sendAll}>
                    Send {picked.size} by {config!.channel === "whatsapp" ? "WhatsApp" : "SMS"}
                  </button>
                ) : null}
              </div>
              <div className="table-scroll">
                <table className="reg report-table msg-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <th>Student</th>
                      <th>Parent / phone</th>
                      <th>Message</th>
                      <th className="right" style={{ width: 150 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.studentId} className={done[r.studentId] ? "msg-done" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            disabled={!r.phone}
                            checked={picked.has(r.studentId)}
                            onChange={(e) =>
                              setPicked((p) => {
                                const n = new Set(p);
                                if (e.target.checked) n.add(r.studentId);
                                else n.delete(r.studentId);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td><b>{r.student}</b><small className="msg-sub">{r.className}</small></td>
                        <td>{r.parent}<small className="msg-sub">{r.phone ? `+${r.phone}` : "No phone saved"}</small></td>
                        <td className="msg-preview">{r.text}</td>
                        <td className="right">
                          {done[r.studentId] ? (
                            <StatusBadge status={done[r.studentId] === "failed" ? "overdue" : "paid"} />
                          ) : r.waLink ? (
                            <button type="button" className="wa-btn" onClick={() => openWhatsApp(r)}>Send on WhatsApp</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : rows ? (
            <EmptyState message="Nobody to message for this selection." />
          ) : null}
        </Panel>
      ) : null}

      {tab === "log" ? (
        <Panel title="Sent log" meta={`${log.length} MESSAGES`}>
          {!log.length ? (
            <EmptyState message="No messages yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg report-table">
                <thead>
                  <tr><th>When</th><th>Type</th><th>Student</th><th>To</th><th>How</th><th>Message</th><th className="right">Status</th></tr>
                </thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l._id}>
                      <td>{prettyDate(l.createdAt)}<small className="msg-sub">{new Date(l.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></td>
                      <td>{TAB_LABEL[l.kind]}</td>
                      <td>{l.studentId ? `${l.studentId.firstName} ${l.studentId.lastName}` : "—"}</td>
                      <td>{l.to !== "-" ? `+${l.to}` : "—"}<small className="msg-sub">{l.recipientName}</small></td>
                      <td>{l.channel === "manual" ? "WhatsApp (by hand)" : l.channel.toUpperCase()}<small className="msg-sub">{l.sentBy?.name}</small></td>
                      <td className="msg-preview">{l.text}{l.error ? <small className="msg-err">{l.error}</small> : null}</td>
                      <td className="right"><span className={`sp-res sp-res-${l.status === "failed" ? "fail" : "pass"}`}>{l.status.toUpperCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "settings" && config ? <MessagingSettings config={config} onSave={saveConfig} /> : null}
    </>
  );
}

function MessagingSettings({ config, onSave }: { config: Config; onSave: (patch: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    provider: config.provider,
    channel: config.channel,
    countryCode: config.countryCode,
    twilioSid: config.twilioSid || "",
    twilioToken: "",
    twilioFrom: config.twilioFrom || "",
    httpUrl: "",
    httpMethod: config.httpMethod || "GET",
  });
  const [t, setT] = useState(config.templates);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="tp-grid">
      <Panel title="How messages are sent">
        <div className="af-grid">
          <label className="af-wide">
            <span>Sending</span>
            <select className={inputClass} value={f.provider} onChange={set("provider")}>
              <option value="none">WhatsApp click-to-send (no gateway, free)</option>
              <option value="twilio">Twilio (SMS or WhatsApp, automatic)</option>
              <option value="http">My SMS company&apos;s web link (automatic)</option>
            </select>
          </label>
          <label>
            <span>Country code</span>
            <input className={inputClass} value={f.countryCode} onChange={set("countryCode")} placeholder="92 or 91" />
          </label>
          {f.provider !== "none" ? (
            <label>
              <span>Channel</span>
              <select className={inputClass} value={f.channel} onChange={set("channel")}>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
          ) : null}
          {f.provider === "twilio" ? (
            <>
              <label><span>Account SID</span><input className={inputClass} value={f.twilioSid} onChange={set("twilioSid")} /></label>
              <label>
                <span>Auth Token {config.hasTwilioToken ? "(saved — leave empty to keep)" : ""}</span>
                <input type="password" className={inputClass} value={f.twilioToken} onChange={set("twilioToken")} autoComplete="new-password" />
              </label>
              <label><span>From number</span><input className={inputClass} value={f.twilioFrom} onChange={set("twilioFrom")} placeholder="+1415…" /></label>
            </>
          ) : null}
          {f.provider === "http" ? (
            <>
              <label className="af-wide">
                <span>Gateway link {config.httpUrlHost ? `(saved: ${config.httpUrlHost} — leave empty to keep)` : ""}</span>
                <input className={inputClass} value={f.httpUrl} onChange={set("httpUrl")} placeholder="https://sms.example.com/send?key=…&to={to}&text={message}" />
              </label>
              <label>
                <span>Method</span>
                <select className={inputClass} value={f.httpMethod} onChange={set("httpMethod")}>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </label>
            </>
          ) : null}
        </div>
        <p className="coa-hint">
          Gateway keys are stored on the server and never shown again. Your SMS company gives you the link — put {"{to}"} where the
          phone number goes and {"{message}"} where the text goes.
        </p>
        <div className="form-actions">
          <button type="button" className="btn-dark" onClick={() => onSave(f)}>Save sending settings</button>
        </div>
      </Panel>
      <Panel title="Message wording">
        {(["absence", "fee", "result"] as const).map((k) => (
          <label key={k} className="msg-text">
            <span>{TAB_LABEL[k]} — {PLACEHOLDERS[k]}</span>
            <textarea className={inputClass} rows={3} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
            <button type="button" className="link-btn" onClick={() => setT({ ...t, [k]: config.defaults[k] })}>Reset to default</button>
          </label>
        ))}
        <div className="form-actions">
          <button type="button" className="btn-dark" onClick={() => onSave({ templates: t })}>Save wording</button>
        </div>
      </Panel>
    </div>
  );
}
