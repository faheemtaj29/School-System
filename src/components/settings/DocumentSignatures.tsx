"use client";

import { useEffect, useState } from "react";
import { DOCUMENT_SIGNATURES, type DocumentSignatureRole, type DocumentSignatureUrls } from "@/lib/documentSignatures";

export function DocumentSignatures() {
  const [signatures, setSignatures] = useState<DocumentSignatureUrls>({});
  const [busy, setBusy] = useState<DocumentSignatureRole | "">("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/settings/signature");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load signatures");
    setSignatures(data.signatures || {});
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load fetches before updating signature state
    load().catch((e: Error) => setError(e.message));
  }, []);

  async function update(role: DocumentSignatureRole, file?: File) {
    if (!file) return;
    setBusy(role);
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Signature image must be 2 MB or smaller.");
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        throw new Error("Use a PNG, JPG or WebP image.");
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the selected image"));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/settings/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, dataUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Signature upload failed");
      setSignatures((current) => ({ ...current, [role]: data.signatureUrl }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove(role: DocumentSignatureRole) {
    setBusy(role);
    setError("");
    try {
      const response = await fetch(`/api/settings/signature?role=${role}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove signature");
      setSignatures((current) => {
        const next = { ...current };
        delete next[role];
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section>
      <div className="form-section-title" style={{ marginTop: 24 }}>Document Signatures</div>
      <p className="coa-hint">Upload transparent PNG signatures. They appear above matching signature lines on result cards, date sheets and other print documents.</p>
      {error ? <div className="alert err">{error}</div> : null}
      <div className="document-signature-grid">
        {DOCUMENT_SIGNATURES.map(({ role, label }) => (
          <div className="document-signature-item" key={role}>
            <div className="document-signature-preview">
              {signatures[role] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signatures[role]} alt={`${label} signature`} />
              ) : <span>No signature</span>}
            </div>
            <b>{label}</b>
            <div className="form-actions">
              <label className="link-btn">
                {busy === role ? "Saving…" : signatures[role] ? "Change" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={Boolean(busy)}
                  onChange={(event) => {
                    update(role, event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {signatures[role] ? (
                <button type="button" className="link-btn" disabled={Boolean(busy)} onClick={() => remove(role)}>Remove</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
