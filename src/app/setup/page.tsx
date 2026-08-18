"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Field, inputClass } from "@/components/ui";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/login", { method: "PUT" })
      .then((r) => {
        if (r.status === 403) router.replace("/login");
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (checking) return <div className="auth">Loading…</div>;

  return (
    <div className="auth">
      <div className="auth-wrap">
        <div className="auth-intro">
          <div className="kicker">First-time setup</div>
          <h1>Create your admin</h1>
          <p>
            This creates the first super admin account. It only works while the database has no
            users.
          </p>
        </div>

        <form className="auth-card" onSubmit={onSubmit}>
          <h2>Admin account</h2>
          <div className="sub">You can add more staff accounts later.</div>
          {error ? <div className="alert err">{error}</div> : null}
          <div className="stack">
            <Field label="Full name" required>
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Faheem Taj"
                required
              />
            </Field>
            <Field label="Email" required>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.local"
                required
              />
            </Field>
            <Field label="Password" required>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                placeholder="At least 6 characters"
                required
              />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-dark w-full" disabled={loading}>
              {loading ? "Creating…" : "Create admin"}
            </button>
          </div>
          <div className="auth-foot">
            Already set up? <Link href="/login">Sign in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
