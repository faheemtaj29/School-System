"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type Login = { _id: string; name: string; email: string; role: string; isActive: boolean };
type Sent = { link: string; expiresAt: string; sent: boolean; waLink: string | null };

/**
 * The office's "send password reset link": lists a person's logins (a student's own and the
 * parent's, or a teacher's / staff member's) and makes a one-time link for each — sent by SMS
 * when a gateway is set up, with Copy and WhatsApp to hand it over directly.
 */
export function LoginAccess({
  kind,
  id,
  roles,
  autoSendTo,
  empty,
}: {
  kind: "student" | "teacher" | "staff";
  id: string;
  /** Only these login roles (e.g. just the parent's login of a student). */
  roles?: string[];
  /** Send a link straight away to the login with this email (right after creating it). */
  autoSendTo?: string;
  /** Shown instead of the list when there is no login yet. */
  empty?: ReactNode;
}) {
  const [logins, setLogins] = useState<Login[] | null>(null);
  const [sent, setSent] = useState<Record<string, Sent>>({});
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const autoSent = useRef(false);

  useEffect(() => {
    fetch(`/api/users/password-reset?kind=${kind}&id=${id}`)
      .then((r) => r.json())
      .then((d) => setLogins(((d.logins || []) as Login[]).filter((l) => !roles || roles.includes(l.role))))
      .catch(() => setLogins([]));
    // roles is a fixed list per caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  useEffect(() => {
    if (!autoSendTo || autoSent.current || !logins) return;
    const l = logins.find((x) => x.email.toLowerCase() === autoSendTo.toLowerCase());
    if (l) {
      autoSent.current = true;
      send(l, false);
    }
  }, [autoSendTo, logins]);

  async function send(l: Login, ask = true) {
    if (ask && !confirm(`Send a password reset link to ${l.name} (${l.email})?\nThe link works once, for one hour. Their current password keeps working until they set a new one.`)) return;
    setBusy(l._id);
    setError("");
    try {
      const res = await fetch("/api/users/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: l._id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not make a reset link");
      setSent((m) => ({ ...m, [l._id]: d }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function copy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError("Copy failed — select the link and copy it by hand.");
    }
  }

  if (!logins) return <div className="auth-help">Loading logins…</div>;
  if (!logins.length) {
    return <>{empty ?? <div className="auth-help">No login yet. Use Portal Login to create one.</div>}</>;
  }
  return (
    <div className="reset-links">
      {error ? <div className="alert err">{error}</div> : null}
      {logins.map((l) => {
        const s = sent[l._id];
        return (
          <div key={l._id} className="reset-login">
            <div className="reset-login-head">
              <div>
                <b>{l.name}</b> <span className="badge">{l.role}</span>
                <div className="cell-sub">{l.email}{l.isActive ? "" : " · disabled"}</div>
              </div>
              <button type="button" className="btn-ghost" disabled={busy === l._id} onClick={() => send(l)}>
                {busy === l._id ? "Making link…" : s ? "Send a new link" : "Send reset link"}
              </button>
            </div>
            {s ? (
              <>
                <div className={`alert ${s.sent ? "ok" : "warn"}`} style={{ margin: 0 }}>
                  {s.sent
                    ? "Sent by SMS to the phone on record."
                    : "No SMS gateway or phone number — share the link below by WhatsApp or copy it."}{" "}
                  Valid until {new Date(s.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.
                </div>
                <code>{s.link}</code>
                <div className="reset-actions">
                  <button type="button" className="link-btn" onClick={() => copy(l._id, s.link)}>
                    {copied === l._id ? "Copied ✓" : "Copy link"}
                  </button>
                  {s.waLink ? (
                    <a className="link-btn" href={s.waLink} target="_blank" rel="noreferrer">
                      Send on WhatsApp
                    </a>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
