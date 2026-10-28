"use client";

import Image from "next/image";
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
  title,
  subtitle,
  live,
  actionLabel,
  onAction,
  actionIcon,
}: {
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
  const label: Record<string, string> = {
    partial: "Partially Paid",
    paid: "Paid",
    pending: "Pending",
    overdue: "Overdue",
    reversed: "Reversed",
  };
  return <span className={`badge ${badgeTone[status] ?? ""}`}>{label[status] || status}</span>;
}

/** Creates or resets the portal login for a teacher/student record. */
export function PortalAccessButton({
  kind,
  id,
  email,
  name,
  onDone,
}: {
  kind: "teacher" | "student" | "staff";
  id: string;
  email?: string;
  name: string;
  onDone?: () => void;
}) {
  async function grant() {
    if (!email) {
      alert(`Add an email address to ${name} before creating a login.`);
      return;
    }
    const password = prompt(
      `Set a portal password for ${name} (${email}).\nMinimum 6 characters.`
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
    alert(`Portal login ready.\nEmail: ${data.email}\nRole: ${data.role}`);
    onDone?.();
  }

  return (
    <button type="button" className="link-btn" onClick={grant}>
      Portal Login
    </button>
  );
}

export function MiniAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const text = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="mini-avatar">
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={40} height={40} unoptimized className="avatar-image" />
      ) : text || "?"}
    </div>
  );
}

export function NameCell({ name, sub, imageUrl }: { name: string; sub?: string; imageUrl?: string }) {
  return (
    <div className="name-cell">
      <MiniAvatar name={name} imageUrl={imageUrl} />
      <div>
        <div style={{ fontWeight: 600 }}>{name}</div>
        {sub ? (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{sub}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ProfilePhotoField({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/uploads/profile", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not upload photo.");
        return;
      }
      onChange(data.url);
    } catch {
      setError("Photo upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="profile-photo-field">
      <MiniAvatar name={name} imageUrl={value || undefined} />
      <div className="profile-photo-controls">
        <label className="profile-photo-button">
          {uploading ? "Uploading photo…" : value ? "Change photo" : "Upload photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            onChange={(event) => {
              void upload(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <span className="profile-photo-hint">
          Shown on the student profile and attendance list · JPG, PNG or WebP · max 5 MB
        </span>
        {value ? (
          <button type="button" className="profile-photo-remove" disabled={uploading} onClick={() => onChange("")}>
            Remove photo
          </button>
        ) : null}
        {error ? <span className="profile-photo-error" role="alert">{error}</span> : null}
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
