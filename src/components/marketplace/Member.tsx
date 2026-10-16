"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { formatPKR } from "@/lib/dealership";
import { AD_LIMITS, BODY_TYPES, type VehicleType } from "@/lib/shop";

type Me = { member: { _id: string; name: string; phone: string; email?: string; city?: string; createdAt: string }; orders: OrderRow[] };
type OrderRow = {
  _id: string; number: string; status: string; total: number; paymentMethod: string; paymentStatus: string;
  createdAt: string; courier?: string; trackingNumber?: string; lines: { title: string; qty: number }[];
};
type Ad = {
  _id: string; vehicleType: VehicleType; make: string; model: string; variant?: string; year: number; mileage: number;
  fuel?: string; transmission?: string; engineCc?: number; color?: string; bodyType?: string; condition: "new" | "used";
  registeredIn?: string; city: string; listPrice: number; negotiable: boolean; description?: string; photos: string[];
  features: string[]; sellerName: string; sellerPhone: string; showPhone: boolean; status: string; rejectReason?: string;
  expiresAt?: string; views: number; contacts: number;
  messages: { _id: string; name: string; phone: string; message?: string; offerPrice?: number; at: string; read: boolean }[];
};

async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong"), { status: res.status });
  return data as T;
}

/* ------------------------------------------------------------- auth */

export function AuthPanel({ onDone, intro }: { onDone: () => void; intro?: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ name: "", phone: "", email: "", city: "", password: "", website: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await call(`/api/site/member/${mode}`, "POST", mode === "login" ? { phone: f.phone, password: f.password } : f);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="site-form mk-auth">
      {intro ? <p className="mk-muted">{intro}</p> : null}
      <div className="mk-chips" style={{ marginBottom: 14 }}>
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Log in</button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create account</button>
      </div>
      <form onSubmit={submit} className="site-form-grid">
        {mode === "register" ? <label>Full name<input value={f.name} onChange={(e) => set("name", e.target.value)} required minLength={2} /></label> : null}
        <label>Mobile number<input value={f.phone} onChange={(e) => set("phone", e.target.value)} required inputMode="tel" placeholder="03xx-xxxxxxx" autoComplete="tel" /></label>
        {mode === "register" ? <label>City<input value={f.city} onChange={(e) => set("city", e.target.value)} /></label> : null}
        {mode === "register" ? <label>Email (optional)<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></label> : null}
        <label>Password<input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>
        <input className="mk-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} aria-hidden="true" />
        {error ? <div className="mk-error" style={{ gridColumn: "1 / -1" }}>{error}</div> : null}
        <button type="submit" className="site-btn" disabled={busy} style={{ gridColumn: "1 / -1", justifySelf: "start" }}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------- ad form */

type AdForm = Omit<Ad, "_id" | "status" | "rejectReason" | "expiresAt" | "views" | "contacts" | "messages" | "year" | "mileage" | "listPrice" | "engineCc" | "features"> & {
  year: string; mileage: string; listPrice: string; engineCc: string; features: string;
};

function blankAd(type: VehicleType, me?: Me["member"]): AdForm {
  return {
    vehicleType: type, make: "", model: "", variant: "", year: String(new Date().getFullYear() - 3), mileage: "",
    fuel: "Petrol", transmission: type === "bike" ? "Manual" : "Automatic", engineCc: "", color: "", bodyType: "",
    condition: "used", registeredIn: "", city: me?.city || "", listPrice: "", negotiable: true, description: "",
    photos: [], features: "", sellerName: me?.name || "", sellerPhone: me?.phone || "", showPhone: true,
  };
}

function adToForm(a: Ad): AdForm {
  return {
    ...a, variant: a.variant || "", color: a.color || "", bodyType: a.bodyType || "", registeredIn: a.registeredIn || "",
    description: a.description || "", fuel: a.fuel || "", transmission: a.transmission || "",
    year: String(a.year), mileage: String(a.mileage), listPrice: String(a.listPrice), engineCc: a.engineCc ? String(a.engineCc) : "",
    features: a.features.join(", "),
  };
}

export function AdEditor({ initial, editId, onSaved }: { initial: AdForm; editId?: string; onSaved: (status: string) => void }) {
  const [f, setF] = useState<AdForm>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AdForm>(k: K, v: AdForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const year = new Date().getFullYear();
  const isBike = f.vehicleType === "bike";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        ...f,
        year: Number(f.year),
        mileage: Number(f.mileage || 0),
        listPrice: Number(f.listPrice || 0),
        engineCc: f.engineCc ? Number(f.engineCc) : undefined,
        features: f.features.split(",").map((x) => x.trim()).filter(Boolean),
      };
      const res = await call<{ ad: { status: string } }>(editId ? `/api/site/member/ads/${editId}` : "/api/site/member/ads", editId ? "PUT" : "POST", body);
      onSaved(res.ad.status);
    } catch (err) {
      setError((err as Error).message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="site-form site-form-admission" onSubmit={submit}>
      {error ? <div className="mk-error" style={{ marginBottom: 12 }}>{error}</div> : null}
      <div className="mk-chips" style={{ marginBottom: 12 }}>
        {(["car", "bike"] as const).map((t) => (
          <button key={t} type="button" className={f.vehicleType === t ? "active" : ""} onClick={() => setF((x) => ({ ...x, vehicleType: t, bodyType: "", transmission: t === "bike" ? "Manual" : x.transmission }))} disabled={Boolean(editId)}>
            {t === "car" ? "🚗 Car" : "🏍️ Motorbike"}
          </button>
        ))}
      </div>
      <div className="site-form-section">Photos (first photo is the cover)</div>
      <ImageUploader value={f.photos} onChange={(v) => set("photos", v)} endpoint="/api/site/member/upload" max={AD_LIMITS.maxPhotos} />

      <div className="site-form-section">Vehicle</div>
      <div className="site-form-grid">
        <label>Make<input value={f.make} onChange={(e) => set("make", e.target.value)} required placeholder={isBike ? "Honda" : "Toyota"} /></label>
        <label>Model<input value={f.model} onChange={(e) => set("model", e.target.value)} required placeholder={isBike ? "CG 125" : "Corolla"} /></label>
        <label>Variant<input value={f.variant} onChange={(e) => set("variant", e.target.value)} placeholder={isBike ? "Self Start" : "Altis 1.6"} /></label>
        <label>Model year
          <select value={f.year} onChange={(e) => set("year", e.target.value)}>
            {Array.from({ length: 45 }, (_, k) => year + 1 - k).map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label>Mileage (km)<input type="number" min={0} value={f.mileage} onChange={(e) => set("mileage", e.target.value)} required /></label>
        <label>Engine (cc)<input type="number" min={0} value={f.engineCc} onChange={(e) => set("engineCc", e.target.value)} /></label>
        <label>Body type
          <select value={f.bodyType} onChange={(e) => set("bodyType", e.target.value)}>
            <option value="">—</option>
            {BODY_TYPES[f.vehicleType].map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <label>Fuel
          <select value={f.fuel} onChange={(e) => set("fuel", e.target.value)}>
            {["Petrol", "Diesel", "Hybrid", "Electric", "CNG"].map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        {!isBike ? (
          <label>Transmission
            <select value={f.transmission} onChange={(e) => set("transmission", e.target.value)}>
              <option>Automatic</option><option>Manual</option>
            </select>
          </label>
        ) : null}
        <label>Colour<input value={f.color} onChange={(e) => set("color", e.target.value)} /></label>
        <label>Registered in<input value={f.registeredIn} onChange={(e) => set("registeredIn", e.target.value)} placeholder="Lahore / Unregistered" /></label>
        <label>Condition
          <select value={f.condition} onChange={(e) => set("condition", e.target.value as "new" | "used")}>
            <option value="used">Used</option><option value="new">New</option>
          </select>
        </label>
      </div>
      <label className="site-form-wide">Features (comma separated)<input value={f.features} onChange={(e) => set("features", e.target.value)} placeholder="Alloy rims, Navigation, Immobilizer" /></label>
      <label className="site-form-wide">Description<textarea rows={4} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="Condition, service history, reason for selling…" /></label>

      <div className="site-form-section">Price & contact</div>
      <div className="site-form-grid">
        <label>Asking price (PKR)<input type="number" min={1000} value={f.listPrice} onChange={(e) => set("listPrice", e.target.value)} required /></label>
        <label>City<input value={f.city} onChange={(e) => set("city", e.target.value)} required /></label>
        <label>Your name<input value={f.sellerName} onChange={(e) => set("sellerName", e.target.value)} required /></label>
        <label>Contact number<input value={f.sellerPhone} onChange={(e) => set("sellerPhone", e.target.value)} required inputMode="tel" /></label>
      </div>
      <label className="mk-check-row"><input type="checkbox" checked={f.negotiable} onChange={(e) => set("negotiable", e.target.checked)} /> Price is negotiable</label>
      <label className="mk-check-row"><input type="checkbox" checked={f.showPhone} onChange={(e) => set("showPhone", e.target.checked)} /> Show my number on the ad (otherwise buyers message you here)</label>
      <button type="submit" className="site-btn" style={{ marginTop: 16 }} disabled={busy || !f.photos.length}>
        {busy ? "Saving…" : editId ? "Save & resubmit" : "Submit ad for review"}
      </button>
      {!f.photos.length ? <span className="mk-muted" style={{ marginLeft: 10 }}>Add at least one photo</span> : null}
    </form>
  );
}

/* ------------------------------------------------------- page shells */

function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const load = useCallback(async () => {
    try {
      setMe(await call<Me>("/api/site/member/me"));
      setState("in");
    } catch {
      setMe(null);
      setState("out");
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  return { me, state, reload: load };
}

export function PostAdApp({ type }: { type: VehicleType }) {
  const { me, state, reload } = useMe();
  const [done, setDone] = useState<string | null>(null);
  if (state === "loading") return <p className="mk-muted">Loading…</p>;
  if (state === "out") return <AuthPanel onDone={reload} intro="Log in or create a free account to post your ad and receive buyer messages." />;
  if (done) {
    return (
      <div className="site-card">
        <h3>{done === "active" ? "Your ad is live ✓" : "Ad submitted ✓"}</h3>
        <p>
          {done === "active"
            ? "Buyers can see it now. Messages from buyers appear in your account."
            : "We review new ads to keep the marketplace safe, usually within a few hours. You can track it in your account."}
        </p>
        <p><Link href="/account" className="site-btn">Go to my ads</Link></p>
      </div>
    );
  }
  return <AdEditor initial={blankAd(type, me?.member)} onSaved={(status) => setDone(status)} />;
}

const STATUS_NOTE: Record<string, string> = {
  pending: "Waiting for review",
  active: "Live",
  rejected: "Needs changes",
  sold: "Sold",
  expired: "Expired",
};

export function AccountApp() {
  const { me, state, reload } = useMe();
  const [ads, setAds] = useState<Ad[]>([]);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [openMsgs, setOpenMsgs] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState("");

  const loadAds = useCallback(async () => {
    try {
      setAds((await call<{ ads: Ad[] }>("/api/site/member/ads")).ads);
      setLoadedAt(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state === "in") loadAds();
  }, [state, loadAds]);

  async function act(id: string, action: string) {
    if (action === "remove" && !confirm("Delete this ad?")) return;
    try {
      await call(`/api/site/member/ads/${id}`, "POST", { action });
      await loadAds();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logout() {
    await call("/api/site/member/logout", "POST");
    reload();
  }

  if (state === "loading") return <p className="mk-muted">Loading…</p>;
  if (state === "out") return <AuthPanel onDone={reload} intro="Log in to manage your ads, read buyer messages and track shop orders." />;
  if (editing) {
    return (
      <>
        <button type="button" className="site-link" onClick={() => setEditing(null)} style={{ background: "none", border: 0, cursor: "pointer", marginBottom: 12 }}>‹ Back to my ads</button>
        <AdEditor initial={adToForm(editing)} editId={editing._id} onSaved={() => { setEditing(null); loadAds(); }} />
      </>
    );
  }

  const m = me!.member;
  return (
    <div className="mk-account">
      <div className="site-card mk-account-head">
        <div>
          <h3>{m.name}</h3>
          <p className="mk-muted">{m.phone}{m.city ? ` · ${m.city}` : ""}</p>
        </div>
        <div className="mk-badges">
          <Link href="/post-ad" className="site-btn">+ Post an ad</Link>
          <button type="button" className="site-btn ghost" onClick={logout}>Log out</button>
        </div>
      </div>
      {error ? <div className="mk-error">{error}</div> : null}

      <h3 style={{ margin: "22px 0 10px" }}>My ads</h3>
      {!ads.length ? (
        <div className="site-card"><p>No ads yet. <Link href="/post-ad" className="site-link">Post your first one →</Link></p></div>
      ) : (
        <div className="mk-my-ads">
          {ads.map((a) => {
            const unread = a.messages.filter((x) => !x.read).length;
            const expiresSoon = a.status === "active" && a.expiresAt && new Date(a.expiresAt).getTime() - loadedAt < 7 * 86_400_000;
            return (
              <div key={a._id} className="site-card mk-my-ad">
                <div className="mk-my-ad-photo" style={a.photos[0] ? { backgroundImage: `url("${a.photos[0]}")` } : undefined} />
                <div className="mk-my-ad-body">
                  <div className="mk-my-ad-top">
                    <b>{a.year} {a.make} {a.model} {a.variant || ""}</b>
                    <span className={`mk-status ${a.status}`}>{STATUS_NOTE[a.status] || a.status}</span>
                  </div>
                  <div className="mk-muted">{formatPKR(a.listPrice)} · {a.city} · {a.views} views · {a.contacts} contacts</div>
                  {a.status === "rejected" && a.rejectReason ? <div className="mk-error">Reviewer: {a.rejectReason}</div> : null}
                  {a.status === "active" && a.expiresAt ? <div className="mk-muted">Live until {new Date(a.expiresAt).toLocaleDateString("en-GB")}</div> : null}
                  <div className="mk-badges" style={{ marginTop: 8 }}>
                    {a.status === "active" ? <Link className="site-link" href={`/${a.vehicleType === "bike" ? "bikes" : "cars"}/${a._id}`}>View ad</Link> : null}
                    {["pending", "active", "rejected"].includes(a.status) ? <button type="button" className="mk-link" onClick={() => setEditing(a)}>Edit</button> : null}
                    {a.status === "active" ? <button type="button" className="mk-link" onClick={() => act(a._id, "mark_sold")}>Mark sold</button> : null}
                    {a.status === "expired" || expiresSoon ? <button type="button" className="mk-link" onClick={() => act(a._id, "renew")}>Renew 30 days</button> : null}
                    <button type="button" className="mk-link" onClick={() => { setOpenMsgs(openMsgs === a._id ? null : a._id); if (unread) act(a._id, "read_messages"); }}>
                      Messages ({a.messages.length}{unread ? `, ${unread} new` : ""})
                    </button>
                    <button type="button" className="mk-link danger" onClick={() => act(a._id, "remove")}>Delete</button>
                  </div>
                  {openMsgs === a._id ? (
                    <ul className="mk-msgs">
                      {!a.messages.length ? <li className="mk-muted">No messages yet.</li> : null}
                      {[...a.messages].reverse().map((x) => (
                        <li key={x._id}>
                          <b>{x.name}</b> · <a href={`tel:${x.phone}`}>{x.phone}</a> · <span className="mk-muted">{new Date(x.at).toLocaleString("en-GB")}</span>
                          {x.offerPrice ? <div>Offer: <b>{formatPKR(x.offerPrice)}</b></div> : null}
                          {x.message ? <div>{x.message}</div> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h3 style={{ margin: "22px 0 10px" }}>My shop orders</h3>
      {!me!.orders.length ? (
        <div className="site-card"><p>No orders yet. <Link href="/shop" className="site-link">Browse the shop →</Link></p></div>
      ) : (
        <div className="site-card">
          <table className="mk-table">
            <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th>Total</th></tr></thead>
            <tbody>
              {me!.orders.map((o) => (
                <tr key={o._id}>
                  <td><b>{o.number}</b></td>
                  <td>{new Date(o.createdAt).toLocaleDateString("en-GB")}</td>
                  <td>{o.lines.map((l) => `${l.qty}× ${l.title}`).join(", ")}</td>
                  <td>{o.status}{o.trackingNumber ? <div className="mk-muted">{o.courier} {o.trackingNumber}</div> : null}</td>
                  <td>{formatPKR(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
