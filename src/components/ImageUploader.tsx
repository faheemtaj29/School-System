"use client";

import { ChangeEvent, useState } from "react";

/**
 * Multi-image picker: uploads each file to `endpoint`, keeps URLs in order.
 * First image is the cover. Works for staff (/api/uploads/image) and
 * members (/api/site/member/upload).
 */
export function ImageUploader({
  value,
  onChange,
  endpoint,
  max = 10,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  endpoint: string;
  max?: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, max - value.length));
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    const added: string[] = [];
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      try {
        const res = await fetch(endpoint, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Upload failed");
        added.push(data.url);
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
    onChange([...value, ...added]);
    setBusy(false);
  }

  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="img-up">
      <div className="img-up-grid">
        {value.map((url, i) => (
          <div key={url} className="img-up-tile" style={{ backgroundImage: `url("${url}")` }}>
            {i === 0 ? <span className="img-up-cover">Cover</span> : null}
            <div className="img-up-actions">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move left">‹</button>
              <button type="button" onClick={() => onChange(value.filter((u) => u !== url))} aria-label="Remove photo">✕</button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} aria-label="Move right">›</button>
            </div>
          </div>
        ))}
        {value.length < max ? (
          <label className={`img-up-add${busy ? " busy" : ""}`}>
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={pick} disabled={busy} hidden />
            <span>{busy ? "Uploading…" : "+ Add photos"}</span>
            <small>{value.length}/{max} · JPG, PNG, WebP · max 5 MB</small>
          </label>
        ) : null}
      </div>
      {error ? <div className="img-up-error">{error}</div> : null}
    </div>
  );
}
