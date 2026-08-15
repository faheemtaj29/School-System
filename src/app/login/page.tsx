"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Field, inputClass } from "@/components/ui";

type Portal = "admin" | "teacher" | "staff" | "student";

const PORTALS: {
  key: Portal;
  label: string;
  blurb: string;
  placeholder: string;
}[] = [
  {
    key: "admin",
    label: "Admin",
    blurb: "Full campus ERP — academics, finance, HR, website",
    placeholder: "admin@school.local",
  },
  {
    key: "teacher",
    label: "Teacher",
    blurb: "Classes, attendance, exams, live & recorded lectures",
    placeholder: "teacher@school.local",
  },
  {
    key: "staff",
    label: "Staff",
    blurb: "Fees, store and day-to-day campus operations",
    placeholder: "staff@school.local",
  },
  {
    key: "student",
    label: "Student",
    blurb: "Courses, fees, results, lectures and certificates",
    placeholder: "student@school.local",
  },
];

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("portal") as Portal) || "admin";
  const [portal, setPortal] = useState<Portal>(
    PORTALS.some((p) => p.key === initial) ? initial : "admin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [admissionNo, setAdmissionNo] = useState("");
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const active = PORTALS.find((p) => p.key === portal)!;

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.ok) router.replace("/dashboard");
      })
      .catch(() => undefined);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          registering
            ? { admissionNo, email, password, confirmPassword }
            : { email, password, expectedRole: portal }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || (registering ? "Registration failed" : "Login failed"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-wrap auth-wrap-wide">
        <div className="auth-intro">
          <div className="kicker">Multi-portal campus system</div>
          <h1>Sabaq</h1>
          <p>
            Separate portals for administrators, teachers, campus staff and students — one school,
            every role.
          </p>
          <ul className="auth-points">
            <li>Teachers record live &amp; uploaded lectures</li>
            <li>Students follow courses, fees and results</li>
            <li>Staff run fees and inventory day-to-day</li>
            <li>Admins control the full ERP</li>
          </ul>
        </div>

        <form className="auth-card" onSubmit={onSubmit}>
          <h2>{registering ? "Create student account" : "Sign in"}</h2>
          <div className="sub">
            {registering
              ? "Use the admission number and email recorded by your school."
              : "Choose your portal, then enter your credentials."}
          </div>

          {!registering ? (
            <div className="portal-grid">
              {PORTALS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`portal-chip${portal === p.key ? " on" : ""}`}
                  onClick={() => setPortal(p.key)}
                >
                  <strong>{p.label}</strong>
                  <span>{p.blurb}</span>
                </button>
              ))}
            </div>
          ) : null}

          {error ? <div className="alert err">{error}</div> : null}
          <div className="stack">
            {registering ? (
              <Field label="Admission number" required>
                <input
                  className={inputClass}
                  value={admissionNo}
                  onChange={(e) => setAdmissionNo(e.target.value)}
                  placeholder="e.g. ADM-2026-001"
                  required
                />
              </Field>
            ) : null}
            <Field label={`${active.label} email`} required>
              <input
                className={inputClass}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={active.placeholder}
                required
              />
            </Field>
            <Field label="Password" required>
              <input
                className={inputClass}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            {registering ? (
              <Field label="Confirm password" required>
                <input
                  className={inputClass}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </Field>
            ) : null}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-dark w-full" disabled={loading}>
              {loading
                ? registering
                  ? "Creating account…"
                  : "Signing in…"
                : registering
                  ? "Create student account"
                  : `Sign in as ${active.label}`}
            </button>
          </div>
          <div className="auth-foot">
            {registering ? (
              <>
                Already registered?{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setRegistering(false);
                    setPortal("student");
                    setError("");
                  }}
                >
                  Student sign in
                </button>
              </>
            ) : (
              <>
                Student first login?{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setRegistering(true);
                    setPortal("student");
                    setError("");
                  }}
                >
                  Create account
                </button>
                {" · "}
                <Link href="/admissions">Apply for admission</Link>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="auth">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
