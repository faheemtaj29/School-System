"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, Hero, ModalForm, Panel, RowMenu, StatusBadge, inputClass } from "@/components/ui";
import { ClassItem, prettyDate, toDateInput } from "@/lib/types";

type Notice = {
  _id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  publishDate: string;
  expiryDate?: string | null;
  classId?: { _id: string; name: string; section: string } | null;
};

type Status = "live" | "scheduled" | "expired";
type View = Status | "all";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  staff: "Staff",
  students: "Students",
  parents: "Parents",
  class: "One class",
};

const empty = {
  title: "",
  body: "",
  audience: "all",
  classId: "",
  priority: "normal",
  publishDate: toDateInput(new Date()),
  expiryDate: "",
};

function statusOf(n: Notice, now = Date.now()): Status {
  if (new Date(n.publishDate).getTime() > now) return "scheduled";
  // An expiry date counts through the end of that day.
  if (n.expiryDate && new Date(n.expiryDate).getTime() + 86_400_000 <= now) return "expired";
  return "live";
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [role, setRole] = useState("");
  const [view, setView] = useState<View>("live");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [err, setErr] = useState("");
  const isAdmin = role === "admin";

  const load = useCallback(async () => {
    const d = await fetch("/api/notices").then((r) => r.json());
    setNotices(d.notices || []);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const r = d.user?.role || "";
        setRole(r);
        if (r === "admin") fetch("/api/classes").then((x) => x.json()).then((c) => setClasses(c.classes || []));
      })
      .catch(() => {});
  }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ ...empty });
    setErr("");
    setOpen(true);
  }

  function openEdit(n: Notice) {
    setEditing(n);
    setForm({
      title: n.title,
      body: n.body,
      audience: n.audience,
      classId: n.classId?._id || "",
      priority: n.priority,
      publishDate: toDateInput(n.publishDate),
      expiryDate: n.expiryDate ? toDateInput(n.expiryDate) : "",
    });
    setErr("");
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const url = editing ? `/api/notices/${editing._id}` : "/api/notices";
    const payload = {
      ...form,
      classId: form.audience === "class" ? form.classId : null,
      expiryDate: form.expiryDate || null,
    };
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setOpen(false);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this notice?")) return;
    await fetch(`/api/notices/${id}`, { method: "DELETE" });
    load();
  }

  const counts = useMemo(() => {
    const c = { live: 0, scheduled: 0, expired: 0, urgent: 0 };
    for (const n of notices) {
      const st = statusOf(n);
      c[st] += 1;
      if (st === "live" && n.priority === "urgent") c.urgent += 1;
    }
    return c;
  }, [notices]);

  const shown = isAdmin && view !== "all" ? notices.filter((n) => statusOf(n) === view) : notices;
  const audienceText = (n: Notice) =>
    n.audience === "class" && n.classId ? `${n.classId.name}-${n.classId.section}` : AUDIENCE_LABEL[n.audience] || n.audience;

  return (
    <>
      <Hero
        title="Notices & Events"
        subtitle={isAdmin ? "Announcements for staff, students, parents or one class — print as a circular or send to parents" : "Announcements from the school"}
        actionLabel={isAdmin ? "Post Notice" : undefined}
        onAction={isAdmin ? openNew : undefined}
      />

      {isAdmin ? (
        <div className="stat-row">
          <div className="stat-tile"><div className="st-val">{counts.live}</div><div className="st-lab">Live now</div></div>
          <div className="stat-tile"><div className="st-val" style={{ color: counts.urgent ? "var(--red)" : undefined }}>{counts.urgent}</div><div className="st-lab">Urgent (live)</div></div>
          <div className="stat-tile"><div className="st-val">{counts.scheduled}</div><div className="st-lab">Scheduled</div></div>
          <div className="stat-tile"><div className="st-val">{counts.expired}</div><div className="st-lab">Expired</div></div>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="tabs">
          {(["live", "scheduled", "expired", "all"] as View[]).map((v) => (
            <button key={v} type="button" className={`tab${view === v ? " active" : ""}`} onClick={() => setView(v)}>
              {v === "all" ? "All" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      ) : null}

      <Panel title="Notice Board" meta={`${shown.length} ITEMS`}>
        {!shown.length ? (
          <EmptyState message={isAdmin ? "Nothing here. Post a notice — it can go to everyone, staff, students, parents or one class." : "No notices right now."} />
        ) : (
          shown.map((n) => {
            const st = statusOf(n);
            return (
              <div key={n._id} className={`nb-item ${n.priority}${st === "expired" ? " dim" : ""}`}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4>
                    {n.title}
                    {n.priority !== "normal" ? <StatusBadge status={n.priority} /> : null}
                    {isAdmin && st !== "live" ? <span className="badge">{st}</span> : null}
                  </h4>
                  <p>{n.body}</p>
                  <div className="nb-meta">
                    {prettyDate(n.publishDate)}
                    {n.expiryDate ? ` → ${prettyDate(n.expiryDate)}` : ""} · {audienceText(n)}
                  </div>
                </div>
                <div className="row-actions" style={{ alignSelf: "flex-start" }}>
                  <Link href={`/print/notice?id=${n._id}`} target="_blank" className="link-btn">
                    Print
                  </Link>
                  {isAdmin ? (
                    <>
                      <button type="button" className="link-btn" onClick={() => openEdit(n)}>Edit</button>
                      <RowMenu>
                        {n.audience !== "staff" ? (
                          <Link
                            href={`/messages?kind=custom&text=${encodeURIComponent(`Dear {parent}, ${n.title}: ${n.body} — {school}`)}${n.audience === "class" && n.classId ? `&classIds=${n.classId._id}` : ""}`}
                            className="link-btn"
                          >
                            Send to parents (SMS / WhatsApp)
                          </Link>
                        ) : null}
                        <button type="button" className="link-btn danger" onClick={() => remove(n._id)}>Delete</button>
                      </RowMenu>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </Panel>

      <ModalForm
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSubmit={onSubmit}
        title={editing ? "Edit Notice" : "Post New Notice"}
        subtitle="Set a future publish date to schedule it; it disappears for students and parents after the expiry date"
        submitLabel={editing ? "Save changes" : "Publish"}
      >
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid one">
          <Field label="Title" required>
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          <Field label="Message" required>
            <textarea className={inputClass} rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          </Field>
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Audience">
            <select className={inputClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              {Object.entries(AUDIENCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          {form.audience === "class" ? (
            <Field label="Class" required>
              <select className={inputClass} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} required>
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c._id} value={c._id}>{c.name}-{c.section}</option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Publish date">
            <input type="date" className={inputClass} value={form.publishDate} onChange={(e) => setForm({ ...form, publishDate: e.target.value })} />
          </Field>
          <Field label="Expiry date (optional)">
            <input type="date" className={inputClass} value={form.expiryDate} min={form.publishDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          </Field>
        </div>
      </ModalForm>
    </>
  );
}
