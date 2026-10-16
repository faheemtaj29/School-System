"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Panel } from "@/components/ui";
import { prettyDate } from "@/lib/types";
import { AD_STATUSES } from "@/lib/shop";
import { Pill, Sheet, api, label, pkr } from "./shared";

type Ad = {
  _id: string; vehicleType: "car" | "bike"; make: string; model: string; variant?: string; year: number; mileage: number;
  city: string; listPrice: number; negotiable: boolean; description?: string; photos: string[]; features: string[];
  sellerName: string; sellerPhone: string; status: string; rejectReason?: string; featured: boolean;
  createdAt: string; publishedAt?: string; expiresAt?: string; views: number; contacts: number; reviewedBy?: string;
  fuel?: string; transmission?: string; engineCc?: number; color?: string; registeredIn?: string;
};

/** Staff review queue for public car/bike ads. */
export function DealershipClassifieds() {
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState<{ ads: Ad[]; counts: Record<string, number> } | null>(null);
  const [open, setOpen] = useState<Ad | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/shop/classifieds${status ? `?status=${status}` : ""}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function act(ad: Ad, body: Record<string, unknown>) {
    try {
      const res = await api<{ ad: Ad }>(`/api/shop/classifieds/${ad._id}`, { method: "POST", json: body });
      setOpen((o) => (o && o._id === ad._id ? { ...o, ...res.ad } : o));
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const withReason = (ad: Ad, action: "reject" | "remove") => {
    const reason = prompt(action === "reject" ? "What should the seller fix? (shown to them)" : "Reason for removal");
    if (reason) act(ad, { action, reason });
  };

  return (
    <>
      <div className="accounting-toolbar dl-toolbar no-print">
        <div className="chips">
          {AD_STATUSES.filter((s) => s !== "removed").map((s) => (
            <button key={s} type="button" className={`filter-chip${status === s ? " active" : ""}`} onClick={() => setStatus(s)}>
              {label(s)} ({data?.counts[s] || 0})
            </button>
          ))}
          <button type="button" className={`filter-chip${status === "" ? " active" : ""}`} onClick={() => setStatus("")}>All</button>
        </div>
        <a className="link-btn" href="/post-ad" target="_blank" rel="noreferrer">Public posting page ↗</a>
      </div>
      {error ? <div className="alert err">{error}</div> : null}
      <Panel>
        {!data ? <EmptyState message="Loading…" /> : !data.ads.length ? <EmptyState message="Nothing here." /> : (
          <div className="table-scroll">
            <table className="reg">
              <thead><tr><th></th><th>Vehicle</th><th>Seller</th><th>Submitted</th><th>Status</th><th className="right">Price</th><th className="right">Views / contacts</th><th></th></tr></thead>
              <tbody>
                {data.ads.map((a) => (
                  <tr key={a._id}>
                    <td><div className="dl-thumb" style={a.photos[0] ? { backgroundImage: `url("${a.photos[0]}")` } : undefined} /></td>
                    <td><b>{a.year} {a.make} {a.model}</b> {a.variant || ""}<div className="muted small">{a.vehicleType === "bike" ? "🏍️ Bike" : "🚗 Car"} · {a.mileage.toLocaleString()} km · {a.city}</div></td>
                    <td>{a.sellerName}<div className="muted small">{a.sellerPhone}</div></td>
                    <td>{prettyDate(a.createdAt)}</td>
                    <td><Pill value={a.status} />{a.featured ? " ★" : ""}</td>
                    <td className="num">{pkr(a.listPrice)}</td>
                    <td className="num">{a.views} / {a.contacts}</td>
                    <td className="right">
                      <button type="button" className="link-btn" onClick={() => setOpen(a)}>Review</button>
                      {a.status === "pending" ? <button type="button" className="link-btn" onClick={() => act(a, { action: "approve" })}>Approve</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Sheet
        open={Boolean(open)}
        title={open ? `${open.year} ${open.make} ${open.model} ${open.variant || ""}` : ""}
        subtitle={open ? <><Pill value={open.status} /> · {pkr(open.listPrice)}{open.negotiable ? " (negotiable)" : ""} · {open.city}</> : null}
        onClose={() => setOpen(null)}
        actions={open ? (
          <>
            {["pending", "rejected"].includes(open.status) ? <button type="button" className="btn-primary" onClick={() => act(open, { action: "approve" })}>Approve</button> : null}
            {["pending", "active"].includes(open.status) ? <button type="button" className="btn-ghost" onClick={() => withReason(open, "reject")}>Reject</button> : null}
          </>
        ) : null}
      >
        {open ? (
          <>
            <div className="dl-ad-photos">
              {open.photos.map((p) => <a key={p} href={p} target="_blank" rel="noreferrer" style={{ backgroundImage: `url("${p}")` }} aria-label="Open photo" />)}
            </div>
            <div className="dl-detail">
              <dl className="dl-specs">
                <dt>Seller</dt><dd>{open.sellerName} · <a href={`tel:${open.sellerPhone}`}>{open.sellerPhone}</a></dd>
                <dt>Mileage</dt><dd>{open.mileage.toLocaleString()} km</dd>
                <dt>Engine / fuel</dt><dd>{open.engineCc ? `${open.engineCc} cc` : "—"} · {open.fuel || "—"} {open.transmission ? `· ${open.transmission}` : ""}</dd>
                <dt>Colour</dt><dd>{open.color || "—"}</dd>
                <dt>Registered in</dt><dd>{open.registeredIn || "—"}</dd>
                <dt>Live until</dt><dd>{prettyDate(open.expiresAt)}</dd>
                <dt>Reviewed by</dt><dd>{open.reviewedBy || "—"}</dd>
              </dl>
              <div>
                {open.description ? <p style={{ whiteSpace: "pre-line" }}>{open.description}</p> : <p className="muted">No description.</p>}
                {open.features.length ? <div className="chips">{open.features.map((f) => <span key={f} className="filter-chip">{f}</span>)}</div> : null}
                {open.rejectReason ? <div className="alert err">{open.rejectReason}</div> : null}
              </div>
            </div>
            <div className="dl-footer-actions">
              {open.status === "active" ? (
                <>
                  <a className="link-btn" href={`/${open.vehicleType === "bike" ? "bikes" : "cars"}/${open._id}`} target="_blank" rel="noreferrer">View live ad ↗</a>
                  <button type="button" className="btn-ghost" onClick={() => act(open, { action: "feature", featured: !open.featured })}>{open.featured ? "Remove from featured" : "Feature this ad"}</button>
                </>
              ) : null}
              {open.status !== "removed" ? <button type="button" className="link-btn danger" onClick={() => withReason(open, "remove")}>Remove ad</button> : null}
            </div>
          </>
        ) : null}
      </Sheet>
    </>
  );
}
