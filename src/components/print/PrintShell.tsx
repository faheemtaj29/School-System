"use client";

import { useEffect, useState, type ReactNode } from "react";

export type SchoolHeader = {
  name: string;
  address?: string;
  phone?: string;
  logoUrl?: string | null;
};

/** Loads JSON for a print page and shows a toolbar that is hidden on paper. */
export function usePrintData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!url) return;
    fetch(url)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Could not load");
        setData(d as T);
      })
      .catch((e: Error) => setError(e.message));
  }, [url]);
  return { data, error };
}

export function PrintShell({
  title,
  info,
  error,
  loading,
  landscape,
  closable = true,
  children,
}: {
  title: string;
  info?: string;
  error?: string;
  loading?: boolean;
  landscape?: boolean;
  /** False on pages opened from a link (no tab of ours to go back to). */
  closable?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <>
      {landscape ? <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style> : (
        <style>{"@page { size: A4; margin: 10mm; }"}</style>
      )}
      <div className="print-toolbar">
        <div>
          <b>{title}</b>
          {info ? <span>{info}</span> : null}
        </div>
        <div>
          <button type="button" className="btn-dark" disabled={loading || !!error} onClick={() => window.print()}>
            Print / Save PDF
          </button>
          {closable ? (
            <button type="button" className="btn-ghost" onClick={() => window.close()}>
              Close
            </button>
          ) : null}
        </div>
      </div>
      {error ? <div className="alert err print-msg">{error}</div> : null}
      {loading && !error ? <div className="print-msg">Preparing…</div> : null}
      <div className={`print-pages${landscape ? " landscape" : ""}`}>{children}</div>
    </>
  );
}

export function SchoolHead({ school, title, sub }: { school: SchoolHeader; title: string; sub?: string }) {
  return (
    <header className="doc-head">
      {school.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={school.logoUrl} alt="" />
      ) : null}
      <div className="doc-head-text">
        <h1>{school.name}</h1>
        {school.address || school.phone ? (
          <p>
            {school.address}
            {school.address && school.phone ? " · " : ""}
            {school.phone ? `Ph: ${school.phone}` : ""}
          </p>
        ) : null}
      </div>
      <div className="doc-head-title">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
    </header>
  );
}

export function fmtDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "13:30" → "1:30 PM" */
export function fmtTime(value?: string) {
  if (!value) return "—";
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h)) return value;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
