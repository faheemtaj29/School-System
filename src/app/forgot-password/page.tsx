"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Field, inputClass } from "@/components/ui";

/** "Forgot password?": asks for the login email and sends a one-time reset link to the phone on record. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not send the link");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="auth-card auth-single" onSubmit={submit}>
        <h2>Find your account</h2>
        {done ? (
          <>
            <div className="alert ok" style={{ marginTop: 14 }}>
              If <b>{email}</b> has an account, a password reset link has been sent to the phone number on record. The
              link works once, for one hour.
            </div>
            <p className="auth-help">
              Didn&apos;t get it? Your number may not be on record — ask the school office to send you a reset link from
              your profile.
            </p>
            <Link href="/login" className="btn-dark w-full">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div className="sub">Enter the email you sign in with. We&apos;ll send a link to set a new password.</div>
            {error ? <div className="alert err">{error}</div> : null}
            <Field label="Email" required>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                required
              />
            </Field>
            <div className="form-actions">
              <button type="submit" className="btn-dark w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </div>
            <div className="auth-foot">
              <Link href="/login">Back to sign in</Link>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
