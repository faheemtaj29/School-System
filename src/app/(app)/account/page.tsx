"use client";

import { FormEvent, useEffect, useState } from "react";
import { Field, Hero, Panel, inputClass } from "@/components/ui";
import { PasswordRules, passwordProblem } from "@/components/PasswordRules";

/** My account: who is signed in, and change password (every role). */
export default function AccountPage() {
  const [me, setMe] = useState<{ name: string; email: string; role: string } | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user || null))
      .catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const problem = passwordProblem(next, confirm);
    if (problem) {
      setMsg({ ok: false, text: problem });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not change the password");
      setMsg({ ok: true, text: "Password changed. Use the new one next time you sign in." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Hero title="My Account" subtitle={me ? `${me.name} · ${me.email} · ${me.role} login` : "Your login and password"} />
      <Panel title="Change password" exportable={false}>
        <form onSubmit={submit} style={{ maxWidth: 440 }}>
          {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
          <div className="stack">
            <Field label="Current password" required>
              <input className={inputClass} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </Field>
            <Field label="New password" required>
              <input className={inputClass} type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" required>
              <input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </Field>
            <PasswordRules password={next} confirm={confirm} />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-dark" disabled={busy}>
              {busy ? "Saving…" : "Change password"}
            </button>
          </div>
          <p className="auth-help" style={{ marginTop: 16 }}>
            Forgot your current password? Sign out and use “Forgot password?” on the sign-in page.
          </p>
        </form>
      </Panel>
    </>
  );
}
