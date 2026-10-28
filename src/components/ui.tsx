"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { PlusIcon } from "@/components/Icons";

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
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  live?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: ReactNode;
}) {
  return (
    <div className="hero">
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
      {actionLabel && onAction ? (
        <button type="button" className="btn-primary" onClick={onAction}>
          {actionIcon ?? <PlusIcon />}
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Panel({
  title,
  meta,
  children,
  style,
}: {
  title?: string;
  meta?: string;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="panel" style={style}>
      {title ? (
        <div className="panel-head">
          <h2>{title}</h2>
          {meta ? <div className="meta">{meta}</div> : null}
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
  const who = kind === "parent" ? `the parent of ${name}` : name;
  async function grant() {
    if (!email) {
      alert(kind === "parent" ? `Add the parent's email to ${name} before creating a parent login.` : `Add an email address to ${name} before creating a login.`);
      return;
    }
    const password = prompt(
      `Set a portal password for ${who} (${email}).\nMinimum 6 characters.`
    );
    if (!password) return;
    if (password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, recordId: id, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Could not create the login");
      return;
    }
    alert(
      kind === "parent"
        ? `Parent login ready.\nEmail: ${data.email}\nChildren linked: ${data.children}`
        : `Portal login ready.\nEmail: ${data.email}\nRole: ${data.role}`
    );
    onDone?.();
  }

  return (
    <button type="button" className="link-btn" onClick={grant}>
      {kind === "parent" ? "Parent Login" : "Portal Login"}
    </button>
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
      {pos ? (
        <div className="row-menu-pop" style={{ top: pos.top, right: pos.right }}>
          {children}
        </div>
      ) : null}
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
            <button type="submit" className="btn-dark" disabled={saving}>
              {saving ? "Saving…" : submitLabel}
            </button>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
