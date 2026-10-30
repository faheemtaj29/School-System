"use client";

import { useEffect, useState } from "react";

type Status = { loaded: boolean; students?: number; teachers?: number; loadedAt?: string };

/**
 * Sample school: load a small realistic data set to try every screen, then remove exactly
 * those records (and everything linked to them) when done. Removing asks for confirmation.
 */
export function SampleData() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/settings/sample")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function add() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/sample", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not load sample data");
      setMsg({
        ok: true,
        text: `Loaded ${d.students} students and ${d.teachers} teachers in ${d.classes.join(" and ")}, with the "${d.term}" date sheet, marks and result cards, fee challans, two weeks of attendance and this month's payslips.`,
      });
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = confirm(
      "Remove all sample data?\n\nThis deletes the sample students and teachers and everything linked to them — fee challans, receipts and their accounting entries, attendance, exam marks, result cards, the sample date sheet, payslips and logins.\n\nRecords you entered yourself are not touched."
    );
    if (!ok) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/sample", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not remove sample data");
      setMsg({ ok: true, text: `Removed ${d.students} sample students and ${d.teachers} sample teachers with all their records.` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fresh">
      <h3>Sample data</h3>
      <p className="fresh-lead">
        Try every screen with a small sample school: 12 students in two classes, 3 teachers with salary structures, an exam
        date sheet with marks and result cards, fee challans (some paid), two weeks of attendance and this month&apos;s
        payslips. Remove it in one click when you are done — only the sample records go.
      </p>
      {status?.loaded ? (
        <div className="alert ok">
          Sample data is loaded: {status.students} students and {status.teachers} teachers
          {status.loadedAt ? ` (since ${new Date(status.loadedAt).toLocaleDateString("en-GB")})` : ""}.
        </div>
      ) : null}
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
      {status?.loaded ? (
        <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
          {busy ? "Removing…" : "Remove sample data"}
        </button>
      ) : (
        <button type="button" className="btn-dark" disabled={busy || !status} onClick={add}>
          {busy ? "Loading sample school… (about a minute)" : "Load sample data"}
        </button>
      )}
    </div>
  );
}
