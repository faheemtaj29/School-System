"use client";

import { useRef, useState } from "react";

/** Shrinks a picked image to at most `max` px on its longest side, as a JPEG data URL. */
async function shrink(file: File, max = 600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file is not an image"));
      el.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Round profile photo for a student or teacher, with "change / remove" when editable.
 * Falls back to initials when there is no photo. Without an `id` (a record not saved
 * yet) the picked photo is only previewed and handed to `onPicked`, to upload after saving.
 */
export function PersonPhoto({
  kind,
  id,
  url,
  name,
  size = 112,
  editable = false,
  onChanged,
  onPicked,
}: {
  kind: "student" | "teacher";
  id?: string;
  url?: string | null;
  name: string;
  size?: number;
  editable?: boolean;
  onChanged?: (url: string | null) => void;
  onPicked?: (dataUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Local override of `url` after a change here; undefined = show what the parent passed.
  const [local, setLocal] = useState<string | null | undefined>(undefined);
  const shown = local === undefined ? url : local;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  async function upload(file?: File) {
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const dataUrl = await shrink(file);
      if (!id) {
        setLocal(dataUrl);
        onPicked?.(dataUrl);
        return;
      }
      const res = await fetch(`/api/${kind}s/${id}/photo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Upload failed");
      setLocal(d.photoUrl);
      onChanged?.(d.photoUrl);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    if (!id) {
      setLocal(null);
      onPicked?.(null);
      return;
    }
    if (!confirm("Remove this photo?")) return;
    setBusy(true);
    await fetch(`/api/${kind}s/${id}/photo`, { method: "DELETE" });
    setBusy(false);
    setLocal(null);
    onChanged?.(null);
  }

  return (
    <div className="pp" style={{ width: size }}>
      <div className="pp-circle" style={{ width: size, height: size, fontSize: size / 2.8 }}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={name} />
        ) : (
          <span>{initials || "?"}</span>
        )}
        {busy ? <div className="pp-busy">…</div> : null}
      </div>
      {editable ? (
        <div className="pp-actions no-print">
          <button type="button" className="link-btn" onClick={() => input.current?.click()}>
            {shown ? "Change photo" : "Add photo"}
          </button>
          {shown ? <button type="button" className="link-btn" onClick={remove}>Remove</button> : null}
          <input ref={input} type="file" accept="image/*" capture="user" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
      ) : null}
      {err ? <div className="pp-err">{err}</div> : null}
    </div>
  );
}

/** Uploads a photo picked on a not-yet-saved record, once it has an id. */
export async function savePickedPhoto(kind: "student" | "teacher", id: string | undefined, dataUrl: string | null) {
  if (!id || !dataUrl) return;
  await fetch(`/api/${kind}s/${id}/photo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
}
