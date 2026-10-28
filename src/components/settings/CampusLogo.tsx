"use client";

import { useRef, useState } from "react";
import { shrink } from "@/components/PersonPhoto";

/**
 * A campus's own logo for its printed documents. Without one, the campus uses the school logo.
 * Saved straight away (it is not part of the Save settings button).
 */
export function CampusLogo({ code, logoUpdatedAt }: { code: string; logoUpdatedAt?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [stamp, setStamp] = useState<string | null>(logoUpdatedAt || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const src = `/api/settings/logo?branch=${encodeURIComponent(code)}${stamp ? `&v=${new Date(stamp).getTime()}` : ""}`;

  async function upload(file?: File) {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const dataUrl = await shrink(file, 400);
      const res = await fetch(`/api/settings/logo?branch=${encodeURIComponent(code)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setStamp(new Date().toISOString());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!confirm("Use the school logo for this campus again?")) return;
    setBusy(true);
    await fetch(`/api/settings/logo?branch=${encodeURIComponent(code)}`, { method: "DELETE" });
    setStamp(null);
    setBusy(false);
  }

  return (
    <div className="campus-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <div>
        <button type="button" className="link-btn" disabled={busy} onClick={() => input.current?.click()}>
          {stamp ? "Change logo" : "Own logo"}
        </button>
        {stamp ? (
          <button type="button" className="link-btn" disabled={busy} onClick={remove}>
            Use school logo
          </button>
        ) : (
          <small>Using the school logo</small>
        )}
        {err ? <small className="err">{err}</small> : null}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </div>
  );
}
