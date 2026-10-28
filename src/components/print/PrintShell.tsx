"use client";

import QRCode from "qrcode";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type SchoolHeader = {
  name: string;
  /** Campus name, when the document belongs to one campus. */
  campus?: string;
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
  // On a phone the A4 page is shrunk to fit the screen; printing uses the real size.
  const pagesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const fit = () => {
      el.style.zoom = "";
      const page = el.querySelector<HTMLElement>(".doc-page");
      if (!page) return;
      const scale = Math.min(1, (document.documentElement.clientWidth - 16) / page.offsetWidth);
      if (scale < 1) el.style.zoom = String(scale);
    };
    fit();
    const obs = new MutationObserver(fit);
    obs.observe(el, { childList: true });
    window.addEventListener("resize", fit);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);
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
      <div ref={pagesRef} className={`print-pages${landscape ? " landscape" : ""}`}>{children}</div>
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
        {school.campus || school.address || school.phone ? (
          <p>{[school.campus, school.address, school.phone ? `Ph: ${school.phone}` : ""].filter(Boolean).join(" · ")}</p>
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

/**
 * Letterhead for the account-style documents (vouchers, ledgers, stock vouchers, certificates):
 * name, campus, contact lines and logo, all from the campus letterhead set in Settings.
 */
export function QbLetterhead({
  school,
  extra,
}: {
  school: SchoolHeader & { email?: string };
  /** An extra contact line, e.g. the employer's tax number. */
  extra?: string;
}) {
  return (
    <div className="qbp-top">
      <div className="qbp-co">
        <b>{school.name}</b>
        {school.campus ? <span>{school.campus}</span> : null}
        {school.address ? <span>{school.address}</span> : null}
        {school.phone ? <span>{school.phone}</span> : null}
        {school.email ? <span>{school.email}</span> : null}
        {extra ? <span>{extra}</span> : null}
      </div>
      {school.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="qbp-logo" src={school.logoUrl} alt="" />
      ) : null}
    </div>
  );
}

/** A QR code (as an image URL) for the given text — challan links, ID card details. */
export function useQr(text: string) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    if (!text) return;
    QRCode.toDataURL(text, { margin: 0, width: 160, errorCorrectionLevel: "M" })
      .then((url) => live && setSrc(url))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [text]);
  return src;
}
