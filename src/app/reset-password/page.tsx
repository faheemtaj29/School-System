"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Field, inputClass } from "@/components/ui";
import { PasswordRules, passwordProblem } from "@/components/PasswordRules";

/** Opened from a reset link: choose a new password (the link works once, for an hour). */
export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<"checking" | "invalid" | "ready" | "done">("checking");
  const [who, setWho] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the link's token once
    setToken(t);
    if (!t) {
      setState("invalid");
      return;
    }
    fetch(`/api/auth/reset?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        setWho(d.email || "");
        setState(d.valid ? "ready" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not set the password");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card auth-single" onSubmit={submit}>
        <h2>Choose a new password</h2>
        {state === "checking" ? <div className="sub">Checking your link…</div> : null}
        {state === "invalid" ? (
          <>
            <div className="alert err" style={{ marginTop: 14 }}>
              This link has expired or was already used. Links work once, for one hour.
            </div>
            <Link href="/forgot-password" className="btn-dark w-full">
              Get a new link
            </Link>
          </>
        ) : null}
        {state === "done" ? (
          <>
            <div className="alert ok" style={{ marginTop: 14 }}>
              Your password has been changed. Sign in with your new password.
            </div>
            <Link href="/login" className="btn-dark w-full">
              Sign in
            </Link>
          </>
        ) : null}
        {state === "ready" ? (
          <>
            <div className="sub">For {who}</div>
            {error ? <div className="alert err">{error}</div> : null}
            <div className="stack">
              <Field label="New password" required>
                <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password" required>
                <input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
              </Field>
              <PasswordRules password={password} confirm={confirm} />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-dark w-full" disabled={busy}>
                {busy ? "Saving…" : "Save new password"}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}
