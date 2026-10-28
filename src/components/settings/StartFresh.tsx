"use client";

import { useEffect, useState } from "react";

type Group = { key: string; label: string; note?: string };
type Counts = Record<string, number>;

/** Groups ticked by default: everything except teachers & staff, whom schools usually keep. */
const DEFAULT_OFF = new Set(["teachers"]);

/**
 * Start fresh: clear sample or old records while the setup stays (profile, campuses, classes,
 * subjects, fee structure, chart of accounts…). Asks for a backup first and the word RESET.
 */
export function StartFresh() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [backedUp, setBackedUp] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/settings/reset")
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups || []);
        setCounts(d.counts || {});
        setPicked((p) => (p.size ? p : new Set((d.groups || []).map((g: Group) => g.key).filter((k: string) => !DEFAULT_OFF.has(k)))));
      })
      .catch(() => {});
  useEffect(() => {
    load();
  }, []);

  function toggle(key: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: [...picked], confirm }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not clear");
      const parts = Object.entries(d.counts as Counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
      setMsg({ ok: true, text: `Done — cleared ${parts.join(", ") || "nothing (it was already empty)"}. Your setup is unchanged.` });
      setConfirm("");
      load();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const countFor: Record<string, number | undefined> = {
    students: counts.students,
    fees: counts.fees,
    accounting: counts.vouchers,
    exams: counts.terms,
    attendance: counts.attendance,
    payroll: counts.payslips,
    inventory: counts.stock,
    messages: counts.messages,
    teachers: counts.teachers,
  };

  return (
    <div className="fresh">
      <h3>Start fresh</h3>
      <p className="fresh-lead">
        Clears sample or old records so the school can start live. <b>Your setup stays</b>: school profile, campuses and
        logos, classes, subjects, sessions, fee structure and fee heads, chart of accounts and parties, exam types,
        approval workflows, inventory items, courses and your admin login.
      </p>

      <div className="fresh-groups">
        {groups.map((g) => (
          <label key={g.key} className={`fresh-group${picked.has(g.key) ? " on" : ""}`}>
            <input type="checkbox" checked={picked.has(g.key)} onChange={() => toggle(g.key)} />
            <span>
              <b>{g.label}</b>
              {countFor[g.key] != null ? <em>{countFor[g.key]} now</em> : null}
              {g.note ? <small>{g.note}</small> : null}
            </span>
          </label>
        ))}
      </div>

      <div className="fresh-steps">
        <div>
          <b>1.</b> Download a backup first (keeps a copy of everything).{" "}
          <a className="link-btn" href="/api/settings/backup" onClick={() => setBackedUp(true)}>
            Download backup
          </a>
          {backedUp ? <span className="fresh-ok"> ✓ downloaded</span> : null}
        </div>
        <div>
          <b>2.</b> Type <code>RESET</code> to confirm:{" "}
          <input className="inp fresh-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder="RESET" />
        </div>
      </div>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
      <button
        type="button"
        className="btn-danger"
        disabled={busy || !picked.size || confirm !== "RESET" || !backedUp}
        onClick={run}
        title={!backedUp ? "Download the backup first" : undefined}
      >
        {busy ? "Clearing…" : `Clear ${picked.size} selected`}
      </button>
    </div>
  );
}
