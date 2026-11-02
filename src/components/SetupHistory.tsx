"use client";

import { useState } from "react";

type Revision = {
  at: string;
  byName?: string;
  summary: string;
  snapshot: Record<string, unknown>;
};

function isRevision(value: unknown): value is Revision {
  return (
    typeof value === "object" &&
    value !== null &&
    "at" in value &&
    typeof value.at === "string" &&
    "summary" in value &&
    typeof value.summary === "string" &&
    "snapshot" in value &&
    typeof value.snapshot === "object" &&
    value.snapshot !== null &&
    !Array.isArray(value.snapshot) &&
    (!("byName" in value) || typeof value.byName === "string")
  );
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => displayValue(item)).join(", ");
  }
  return JSON.stringify(value) ?? String(value);
}

export function SetupHistory({ url, label = "History" }: { url: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Revision[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (history || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(url);
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Could not load history";
        throw new Error(message);
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("history" in data) ||
        !Array.isArray(data.history) ||
        !data.history.every(isRevision)
      ) {
        throw new Error("History response was invalid");
      }
      setHistory(data.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="setup-history">
      <button type="button" className="link-btn" aria-expanded={open} onClick={toggle}>
        {open ? `Hide ${label.toLowerCase()}` : label}
      </button>
      {open ? (
        <div className="setup-history-list">
          {loading ? <span className="muted small">Loading history…</span> : null}
          {error ? <div className="alert err">{error}</div> : null}
          {history?.length ? [...history].reverse().map((entry, index) => (
            <details className="setup-history-entry" key={`${entry.at}-${index}`}>
              <summary>
                <b>{entry.summary}</b>
                <small>
                  {new Date(entry.at).toLocaleString("en-GB")}
                  {entry.byName ? ` · ${entry.byName}` : ""}
                </small>
              </summary>
              <dl>
                {Object.entries(entry.snapshot || {}).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                    <dd>{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )) : null}
          {!loading && !error && history && !history.length ? (
            <span className="muted small">No history recorded yet.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
