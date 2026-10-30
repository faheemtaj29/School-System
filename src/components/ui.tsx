"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PlusIcon } from "@/components/Icons";
import { TableExport } from "@/components/TableExport";
import { LoginAccess } from "@/components/LoginAccess";

export const inputClass = "inp";

export type OptionListKey =
  | "ledgerCategories"
  | "inventoryCategories"
  | "inventoryUnits"
  | "inventoryLocations"
  | "suppliers"
  | "feeHeads";

/**
 * Admin-managed dropdown. The + button persists a new value in Settings,
 * then immediately selects it for the current form.
 */
export function OptionSelect({
  listKey,
  value,
  onChange,
  placeholder = "Select",
  addLabel = "Add new",
  required,
}: {
  listKey: OptionListKey;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  addLabel?: string;
  required?: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    const load = () => {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => {
          if (live) setOptions(d.settings?.optionLists?.[listKey] || []);
        })
        .catch(() => undefined);
    };
    load();
    const sync = () => load();
    window.addEventListener("sabaq-options-updated", sync);
    return () => {
      live = false;
      window.removeEventListener("sabaq-options-updated", sync);
    };
  }, [listKey]);

  async function addOption() {
    const entered = window.prompt(`${addLabel}:`);
    const clean = entered?.trim();
    if (!clean) return;
    const existing = options.find((item) => item.toLowerCase() === clean.toLowerCase());
    if (existing) {
      onChange(existing);
      return;
    }

    setAdding(true);
    try {
      const res = await fetch("/api/settings/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: listKey, value: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Could not add option");
        return;
      }
      setOptions((current) => [...current, data.value]);
      onChange(data.value);
      window.dispatchEvent(new Event("sabaq-options-updated"));
    } finally {
      setAdding(false);
    }
  }

  const visible = value && !options.includes(value) ? [...options, value] : options;

  return (
    <div className="select-add-row">
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      >
        <option value="">{placeholder}</option>
        {visible.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="select-add-btn"
        onClick={addOption}
        disabled={adding}
        title={addLabel}
        aria-label={addLabel}
      >
        {adding ? "…" : "+"}
      </button>
    </div>
  );
}

export function Hero({
  kicker,
  title,
  subtitle,
  live,
  actionLabel,
  onAction,
  actionIcon,
  extra,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  live?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
  /** More buttons beside the main action (e.g. Import from Excel). */
  extra?: ReactNode;
}) {
  return (
    <div className="hero page-hero">
      <div className="hero-text">
        {kicker ? <div className="hero-kicker">{kicker}</div> : null}
        <h1>{title}</h1>
        {subtitle || live ? (
          <div className="sub">
            {subtitle}
            {live ? <span className="live">{live}</span> : null}
          </div>
        ) : null}
      </div>
      {extra || (actionLabel && onAction) ? (
        <div className="hero-actions">
          {extra}
          {actionLabel && onAction ? (
            <button type="button" className="btn-primary" onClick={onAction}>
              {actionIcon ?? <PlusIcon />}
              {actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A titled card. When it holds a table, its header gets Export (Excel, CSV, Print / PDF). */
export function Panel({
  title,
  meta,
  children,
  style,
  exportable = true,
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  style?: React.CSSProperties;
  exportable?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div className="panel" style={style} ref={ref}>
      {title ? (
        <div className="panel-head">
          <h2>{title}</h2>
          <div className="panel-head-side">
            {meta ? <div className="meta">{meta}</div> : null}
            {exportable ? <TableExport root={ref} title={title} /> : null}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label>
        {label}
        {required ? <span className="req"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="empty">{message}</div>;
}

const badgeTone: Record<string, string> = {
  active: "present",
  present: "present",
  paid: "present",
  graduated: "info",
  excused: "info",
  inactive: "",
  absent: "absent",
  overdue: "absent",
  late: "leave",
  leave: "leave",
  pending: "leave",
  partial: "leave",
  draft: "leave",
  posted: "present",
  void: "absent",
  open: "present",
  ongoing: "info",
  closed: "",
  completed: "present",
  dropped: "absent",
  approved: "present",
  rejected: "absent",
  scheduled: "leave",
  live: "present",
  foundation: "info",
  planned: "leave",
  available: "present",
  unavailable: "absent",
  low: "leave",
  issued: "present",
  returned: "info",
  lost: "absent",
  maintenance: "leave",
  full: "leave",
  vacated: "info",
  emergency: "absent",
  in_use: "present",
  repair: "leave",
  disposed: "absent",
  idle: "leave",
  done: "present",
  queued: "leave",
  failed: "absent",
  urgent: "absent",
  high: "leave",
  normal: "info",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${badgeTone[status] ?? ""}`}>{status}</span>;
}

/** Creates or resets the portal login for a teacher/student record. */
/**
 * "Portal Login" on a person's row: one window to manage their login — create it (by sending a
 * set-your-password link, or setting one now) and send password reset links, Facebook style.
 */
export function PortalAccessButton({
  kind,
  id,
  email,
  name,
  onDone,
}: {
  kind: "teacher" | "student" | "staff" | "parent";
  id: string;
  email?: string;
  name: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        {kind === "parent" ? "Parent Login" : "Portal Login"}
      </button>
      {open
        ? createPortal(
            <PortalAccessDialog kind={kind} id={id} email={email} name={name} onClose={() => setOpen(false)} onDone={onDone} />,
            document.body
          )
        : null}
    </>
  );
}

function PortalAccessDialog({
  kind,
  id,
  email,
  name,
  onClose,
  onDone,
}: {
  kind: "teacher" | "student" | "staff" | "parent";
  id: string;
  email?: string;
  name: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const who = kind === "parent" ? `the parent of ${name}` : name;
  const role = kind === "parent" ? "parent" : kind;
  const [mode, setMode] = useState<"link" | "password">("link");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [created, setCreated] = useState("");

  async function create() {
    setError("");
    if (!email) {
      setError(kind === "parent" ? `Add the parent's email to ${name} first.` : `Add an email address to ${name} first.`);
      return;
    }
    if (mode === "password" && (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setError("Use at least 8 characters with letters and numbers.");
      return;
    }
    setBusy(true);
    try {
      // With a link, the login starts with a random password nobody knows; the person sets their own.
      const pw = mode === "password" ? password : `${crypto.randomUUID()}Aa1`;
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, recordId: id, email, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the login");
      setCreated(mode === "link" ? data.email || email : "");
      setVersion((v) => v + 1);
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={`Login for ${who}`}>
        <div className="modal-head">
          <div>
            <h2>Login &amp; password</h2>
            <div className="sub">{who}{email ? ` · ${email}` : ""}</div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <LoginAccess
            key={version}
            kind={kind === "parent" ? "student" : kind}
            id={id}
            roles={[role]}
            autoSendTo={created}
            empty={
              <div className="stack">
                <div className="auth-help" style={{ margin: 0 }}>
                  No {role} login yet. Create one with {email || "an email address"}:
                </div>
                <label className="check-row">
                  <input type="radio" checked={mode === "link"} onChange={() => setMode("link")} />
                  Send a link so they set their own password (recommended)
                </label>
                <label className="check-row">
                  <input type="radio" checked={mode === "password"} onChange={() => setMode("password")} />
                  Set a password now and tell them
                </label>
                {mode === "password" ? (
                  <input className={inputClass} type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters, letters and numbers" />
                ) : null}
                {error ? <div className="alert err">{error}</div> : null}
                <div>
                  <button type="button" className="btn-dark" disabled={busy} onClick={create}>
                    {busy ? "Creating…" : mode === "link" ? "Create login & send link" : "Create login"}
                  </button>
                </div>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}

export function MiniAvatar({ name, photo }: { name: string; photo?: string | null }) {
  const text = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="mini-avatar photo" src={photo} alt="" loading="lazy" />;
  }
  return <div className="mini-avatar">{text || "?"}</div>;
}

export function NameCell({ name, sub, photo, href }: { name: string; sub?: string; photo?: string | null; href?: string }) {
  return (
    <div className="name-cell">
      <MiniAvatar name={name} photo={photo} />
      <div>
        {href ? (
          <a href={href} className="name-link">{name}</a>
        ) : (
          <div style={{ fontWeight: 600 }}>{name}</div>
        )}
        {sub ? (
          <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{sub}</div>
        ) : null}
      </div>
    </div>
  );
}

/** "Accounting › Reports › Trial Balance" trail; repeated neighbours are shown once. */
export function Breadcrumb({ items }: { items: string[] }) {
  const trail = items.filter((x, i) => x && x !== items[i - 1]);
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((x, i) => (
        <span key={i} className={i === trail.length - 1 ? "here" : ""}>
          {x}
        </span>
      ))}
    </nav>
  );
}

/** Secondary row actions folded into one "More" menu so table rows stay on one line. */
export function RowMenu({ children }: { children: ReactNode }) {
  // Fixed position so the menu is not clipped by scrolling table wrappers.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    // Defer so the click that opened the menu does not close it straight away.
    const t = setTimeout(() => document.addEventListener("click", close), 0);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  return (
    <div className="row-menu">
      <button
        type="button"
        className="link-btn"
        aria-expanded={!!pos}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos((p) => (p ? null : { top: r.bottom + 4, right: window.innerWidth - r.right }));
        }}
      >
        More ▾
      </button>
      {/* Kept mounted while closed, so a dialog opened from the menu stays open. */}
      <div className="row-menu-pop" style={pos ? { top: pos.top, right: pos.right } : { display: "none" }}>
        {children}
      </div>
    </div>
  );
}

export function ModalForm({
  title,
  subtitle,
  open,
  onClose,
  children,
  onSubmit,
  submitLabel = "Save",
  wide,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void | Promise<void>;
  submitLabel?: string;
  wide?: boolean;
}) {
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!onSubmit) return;
    setSaving(true);
    try {
      await onSubmit(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={`modal${wide ? " wide" : ""}`}
      >
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          {children}
          <div className="form-actions">
            {onSubmit ? (
              <button type="submit" className="btn-dark" disabled={saving}>
                {saving ? "Saving…" : submitLabel}
              </button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={onClose}>
              {onSubmit ? "Cancel" : "Close"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
