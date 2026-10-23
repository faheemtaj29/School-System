"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, Field, Hero, ModalForm, Panel, StatusBadge, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";

type Notice = {
  _id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  publishDate: string;
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: "4px solid var(--danger)",
  high: "4px solid var(--warn, #e97316)",
  normal: "4px solid var(--line)",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
};

const empty = { title: "", body: "", audience: "all", priority: "normal", publishDate: toDateInput(new Date()) };

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/notices").then((r) => r.json());
    setNotices(d.notices || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    setForm({ ...empty });
    setOpen(true);
  }

  function openEdit(n: Notice) {
    setEditing(n);
    setForm({ title: n.title, body: n.body, audience: n.audience, priority: n.priority, publishDate: toDateInput(new Date(n.publishDate)) });
    setOpen(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const url = editing ? `/api/notices/${editing._id}` : "/api/notices";
    const method = editing ? "PATCH" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok) { setErr(data.error || "Failed"); return; }
    setOpen(false);
    setEditing(null);
    setForm({ ...empty });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this notice?")) return;
    await fetch(`/api/notices/${id}`, { method: "DELETE" });
    load();
  }

  const urgent = notices.filter((n) => n.priority === "urgent").length;
  const high = notices.filter((n) => n.priority === "high").length;

  return (
    <>
      <Hero title="Notices & Events" subtitle="School-wide announcements" actionLabel="Post Notice" onAction={openNew} />

      {urgent > 0 || high > 0 ? (
        <div className="stat-row" style={{ marginBottom: 0 }}>
          {urgent > 0 ? <div className="stat-tile" style={{ borderLeft: "4px solid var(--danger)" }}><div className="st-val">{urgent}</div><div className="st-lab">Urgent</div></div> : null}
          {high > 0 ? <div className="stat-tile" style={{ borderLeft: "4px solid var(--warn, #e97316)" }}><div className="st-val">{high}</div><div className="st-lab">High Priority</div></div> : null}
          <div className="stat-tile"><div className="st-val">{notices.length}</div><div className="st-lab">Total</div></div>
        </div>
      ) : null}

      <Panel title="Notice Board" meta={`${notices.length} ITEMS`}>
        {!notices.length ? (
          <EmptyState message="No notices posted yet." />
        ) : (
          notices.map((n) => (
            <div
              className="deadline-row"
              key={n._id}
              style={{
                alignItems: "flex-start",
                borderLeft: PRIORITY_BORDER[n.priority] || PRIORITY_BORDER.normal,
                paddingLeft: 12,
                marginLeft: -4,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div className="dname">{n.title}</div>
                  <StatusBadge status={n.priority} />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text)", marginTop: 4, lineHeight: 1.5 }}>{n.body}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>
                  {prettyDate(n.publishDate)} · {n.audience.toUpperCase()} · {PRIORITY_LABEL[n.priority] || n.priority}
                </div>
              </div>
              <div className="row-actions">
                <button type="button" className="link-btn" onClick={() => openEdit(n)}>Edit</button>
                <button type="button" className="link-btn danger" onClick={() => remove(n._id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </Panel>

      <ModalForm
        open={open}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSubmit={onSubmit}
        title={editing ? "Edit Notice" : "Post New Notice"}
        submitLabel={editing ? "Save changes" : "Publish"}
      >
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid one">
          <Field label="Title" required>
            <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          <Field label="Message" required>
            <textarea className={inputClass} rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          </Field>
        </div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <Field label="Audience">
            <select className={inputClass} value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all">All</option>
              <option value="staff">Staff</option>
              <option value="students">Students</option>
              <option value="parents">Parents</option>
            </select>
          </Field>
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
        </div>
      </ModalForm>
    </>
  );
}
