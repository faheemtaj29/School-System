"use client";

/** The same rules the server checks (password.service): 8+ characters, letters and numbers. */
const RULES = [
  { label: "At least 8 characters", ok: (p: string) => p.length >= 8 },
  { label: "Letters and numbers", ok: (p: string) => /[A-Za-z]/.test(p) && /\d/.test(p) },
];

export function passwordProblem(password: string, confirm: string) {
  const failed = RULES.find((r) => !r.ok(password));
  if (failed) return `${failed.label} — please choose a stronger password`;
  if (password !== confirm) return "The two passwords don't match";
  return "";
}

/** Live checklist under a new-password field. */
export function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  const items = [
    ...RULES.map((r) => ({ label: r.label, ok: r.ok(password) })),
    { label: "Both entries match", ok: Boolean(password) && password === confirm },
  ];
  return (
    <ul className="pw-rules">
      {items.map((r) => (
        <li key={r.label} className={r.ok ? "ok" : ""}>
          {r.ok ? "✓" : "•"} {r.label}
        </li>
      ))}
    </ul>
  );
}
