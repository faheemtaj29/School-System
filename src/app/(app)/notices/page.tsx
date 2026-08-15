"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, Field, Hero, ModalForm, Panel, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";

type Notice = {
  _id: string;
  title: string;
  body: string;
  audience: string;
  priority: string;
  publishDate: string;
};

export default function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    audience: "all",
    priority: "normal",
    publishDate: toDateInput(new Date()),
  });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/notices").then((r) => r.json());
    setNotices(d.notices || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setOpen(false);
    setForm({ title: "", body: "", audience: "all", priority: "normal", publishDate: toDateInput(new Date()) });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this notice?")) return;
    await fetch(`/api/notices/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <>
      <Hero title="Notices & Events" subtitle="School-wide announcements" actionLabel="Post Notice" onAction={() => setOpen(true)} />
      <Panel title="Notice Board">
        {!notices.length ? (
          <EmptyState message="No notices posted yet." />
        ) : (
          notices.map((n) => (
            <div className="deadline-row" key={n._id} style={{ alignItems: "flex-start" }}>
              <div>
                <div className="dname">{n.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{n.body}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", marginTop: 6 }}>
                  {prettyDate(n.publishDate)} · {n.audience.toUpperCase()} · {n.priority.toUpperCase()}
                </div>
              </div>
              <button type="button" className="link-btn danger" onClick={() => remove(n._id)}>Delete</button>
            </div>
          ))
        )}
      </Panel>

      <ModalForm open={open} onClose={() => setOpen(false)} onSubmit={onSubmit} title="Post New Notice" submitLabel="Publish">
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
        </div>
      </ModalForm>
    </>
  );
}
