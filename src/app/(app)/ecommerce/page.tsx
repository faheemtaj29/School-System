"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, Field, Hero, ModalForm, Panel, inputClass } from "@/components/ui";
import { ImageUploader } from "@/components/ImageUploader";
import { Pill, Sheet, Stat, api, label, pkr } from "@/components/dealership/shared";
import { FIT_TYPES, ORDER_STATUSES, SHOP_CATEGORIES } from "@/lib/shop";
import { prettyDate } from "@/lib/types";

type Listing = {
  published: boolean; slug: string; title?: string; brand?: string; shopCategory: string; fit: "car" | "bike" | "universal";
  description?: string; images: string[]; compareAtPrice?: number; featured: boolean; tags: string[]; fitment?: string;
};
type Product = { _id: string; sku: string; name: string; category: string; unit: string; salePrice: number; unitCost: number; available: number; shop: Listing | null };
type Order = {
  _id: string; number: string; status: string; customerName: string; phone: string; email?: string; address: string; city: string; notes?: string;
  lines: { itemId: string; sku: string; title: string; qty: number; unitPrice: number; lineTotal: number }[];
  subtotal: number; deliveryFee: number; total: number; paymentMethod: string; paymentStatus: string; paymentReference?: string;
  branchCode: string; stockVoucherNumber?: string; courier?: string; trackingNumber?: string; cancelReason?: string;
  events: { status: string; note?: string; at: string; byName?: string }[]; createdAt: string;
};
type Settings = {
  enabled: boolean; classifiedsEnabled: boolean; fulfilmentBranch: string; deliveryFee: number; freeDeliveryOver: number;
  codEnabled: boolean; bankTransferEnabled: boolean; bankDetails?: string; whatsapp?: string; moderateAds: boolean;
};
type Overview = { settings: Settings; orders: Order[]; counts: Record<string, number>; mtd: { orders: number; revenue: number }; products: Product[] };

const TABS = [["orders", "Orders"], ["products", "Products"], ["settings", "Settings"]] as const;
type Tab = (typeof TABS)[number][0];

export default function EcommercePage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] || "orders") as Tab;
  const [data, setData] = useState<Overview | null>(null);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [role, setRole] = useState("");
  const [openOrder, setOpenOrder] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());
      setData(await api<Overview>(`/api/shop?${qs.toString()}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, q]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setRole(d.user?.role || "")).catch(() => undefined);
  }, []);

  const go = (t: Tab) => router.push(`${pathname}?tab=${t}`);
  const order = data?.orders.find((o) => o._id === openOrder) || null;

  return (
    <>
      <Hero title="Online Shop" subtitle="Car & bike accessories, oils and parts — orders post straight to inventory and accounts" />
      {data ? (
        <div className="pay-stat-row">
          <Stat label="New orders" value={data.counts.pending || 0} tone={data.counts.pending ? "warn" : undefined} />
          <Stat label="To dispatch" value={data.counts.confirmed || 0} />
          <Stat label="This month" value={data.mtd.orders} hint={pkr(data.mtd.revenue)} tone="good" />
          <Stat label="Live products" value={data.products.filter((p) => p.shop?.published).length} hint={`${data.products.length} items in inventory`} />
          <Stat label="Out of stock (live)" value={data.products.filter((p) => p.shop?.published && p.available <= 0).length} tone="bad" />
        </div>
      ) : null}
      <div className="accounting-toolbar no-print">
        <div className="tabs" style={{ marginBottom: 0 }}>
          {TABS.map(([k, l]) => (
            <button key={k} type="button" className={`tab${tab === k ? " active" : ""}`} onClick={() => go(k)}>{l}</button>
          ))}
        </div>
        <a className="link-btn" href="/shop" target="_blank" rel="noreferrer">Open storefront ↗</a>
      </div>
      {error ? <div className="alert err">{error}</div> : null}
      {!data ? <EmptyState message="Loading…" /> : null}

      {data && tab === "orders" ? (
        <>
          <div className="accounting-toolbar dl-toolbar no-print">
            <div className="chips">
              {[...ORDER_STATUSES, ""].map((s) => (
                <button key={s || "all"} type="button" className={`filter-chip${status === s ? " active" : ""}`} onClick={() => setStatus(s)}>
                  {s ? label(s) : "All"} {s ? `(${data.counts[s] || 0})` : ""}
                </button>
              ))}
            </div>
            <input className={inputClass} placeholder="Search order no, name, phone, city…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Panel>
            {data.orders.length ? (
              <div className="table-scroll">
                <table className="reg">
                  <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th>Payment</th><th className="right">Total</th></tr></thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o._id} onClick={() => setOpenOrder(o._id)} style={{ cursor: "pointer" }}>
                        <td><b>{o.number}</b><div className="muted small">{prettyDate(o.createdAt)}</div></td>
                        <td>{o.customerName}<div className="muted small">{o.phone} · {o.city}</div></td>
                        <td>{o.lines.reduce((s, l) => s + l.qty, 0)} items<div className="muted small">{o.lines[0]?.title}{o.lines.length > 1 ? ` +${o.lines.length - 1}` : ""}</div></td>
                        <td><Pill value={o.status} /></td>
                        <td>{o.paymentMethod === "cod" ? "COD" : "Bank"} · <Pill value={o.paymentStatus} /></td>
                        <td className="num">{pkr(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message="No orders in this view." />}
          </Panel>
          <OrderSheet order={order} isAdmin={role === "admin"} onClose={() => setOpenOrder(null)} onChanged={load} />
        </>
      ) : null}

      {data && tab === "products" ? <ProductsTab products={data.products} branch={data.settings.fulfilmentBranch} onChanged={load} /> : null}
      {data && tab === "settings" ? <SettingsTab settings={data.settings} isAdmin={role === "admin"} onSaved={load} /> : null}
    </>
  );
}

function OrderSheet({ order, isAdmin, onClose, onChanged }: { order: Order | null; isAdmin: boolean; onClose: () => void; onChanged: () => void }) {
  const [msg, setMsg] = useState("");
  const [ship, setShip] = useState({ courier: "TCS", trackingNumber: "" });
  const [note, setNote] = useState("");

  async function act(body: Record<string, unknown>) {
    if (!order) return;
    try {
      await api(`/api/shop/orders/${order._id}`, { method: "POST", json: body });
      setMsg("");
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  const reason = (what: string) => prompt(`Reason to ${what} this order?`);

  return (
    <Sheet
      open={Boolean(order)}
      title={order ? order.number : "Order"}
      subtitle={order ? <>{prettyDate(order.createdAt)} · <Pill value={order.status} /> · {order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"} <Pill value={order.paymentStatus} /></> : null}
      onClose={onClose}
      actions={order ? <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>Packing slip</button> : null}
    >
      {msg ? <div className="alert err no-print">{msg}</div> : null}
      {order ? (
        <>
          <div className="dl-detail">
            <div>
              <div className="form-section-title">Deliver to</div>
              <p><b>{order.customerName}</b> · <a href={`tel:${order.phone}`}>{order.phone}</a>{order.email ? ` · ${order.email}` : ""}</p>
              <p>{order.address}, {order.city}</p>
              {order.notes ? <p className="muted small">Note: {order.notes}</p> : null}
              {order.trackingNumber ? <p>Courier <b>{order.courier}</b> · {order.trackingNumber}</p> : null}
              {order.stockVoucherNumber ? <p className="muted small">Stock voucher {order.stockVoucherNumber} · branch {order.branchCode}</p> : null}
              {order.cancelReason ? <div className="alert err">{order.cancelReason}</div> : null}
            </div>
            <div className="dl-summary flat">
              {order.lines.map((l) => (
                <div key={l.itemId}><span>{l.qty} × {l.title} <span className="muted small">{l.sku}</span></span><b>{pkr(l.lineTotal)}</b></div>
              ))}
              <div><span>Delivery</span><b>{order.deliveryFee ? pkr(order.deliveryFee) : "Free"}</b></div>
              <div className="total"><span>Total</span><b>{pkr(order.total)}</b></div>
            </div>
          </div>

          <div className="dl-footer-actions no-print">
            {order.status === "pending" ? <button type="button" className="btn-primary" onClick={() => act({ action: "confirm" })}>Confirm & deduct stock</button> : null}
            {order.status === "confirmed" ? (
              <form className="dl-inline-form" onSubmit={(e: FormEvent) => { e.preventDefault(); act({ action: "dispatch", ...ship }); }}>
                <select className={inputClass} value={ship.courier} onChange={(e) => setShip({ ...ship, courier: e.target.value })}>
                  {["TCS", "Leopards", "M&P", "Trax", "PostEx", "Call Courier", "Own rider"].map((c) => <option key={c}>{c}</option>)}
                </select>
                <input className={inputClass} placeholder="Tracking / CN number" value={ship.trackingNumber} onChange={(e) => setShip({ ...ship, trackingNumber: e.target.value })} required />
                <button type="submit" className="btn-dark">Mark dispatched</button>
              </form>
            ) : null}
            {order.status === "dispatched" ? <button type="button" className="btn-primary" onClick={() => act({ action: "deliver" })}>Mark delivered{order.paymentMethod === "cod" ? " (cash collected)" : ""}</button> : null}
            {order.paymentStatus === "unpaid" && order.status !== "cancelled" ? (
              <button type="button" className="btn-ghost" onClick={() => { const r = prompt("Payment reference (optional)"); if (r !== null) act({ action: "mark_paid", reference: r || undefined }); }}>Mark paid</button>
            ) : null}
            {["pending", "confirmed", "dispatched"].includes(order.status) && (isAdmin || order.status === "pending") ? (
              <button type="button" className="link-btn danger" onClick={() => { const r = reason("cancel"); if (r) act({ action: "cancel", reason: r }); }}>Cancel order</button>
            ) : null}
            {order.status === "delivered" && isAdmin ? (
              <button type="button" className="link-btn danger" onClick={() => { const r = reason("return"); if (r) act({ action: "return", reason: r }); }}>Customer return</button>
            ) : null}
          </div>

          <div className="form-section-title no-print">History</div>
          <ol className="dl-timeline no-print">
            {[...order.events].reverse().map((ev, i) => (
              <li key={i}><span className="dl-tl-icon">•</span><div><b>{label(ev.status)}</b>{ev.note ? ` — ${ev.note}` : ""}<div className="muted small">{new Date(ev.at).toLocaleString("en-GB")} · {ev.byName || "—"}</div></div></li>
            ))}
          </ol>
          <form className="dl-inline-form no-print" onSubmit={(e: FormEvent) => { e.preventDefault(); act({ action: "note", note }); setNote(""); }}>
            <input className={inputClass} placeholder="Internal note (call log, customer request…)" value={note} onChange={(e) => setNote(e.target.value)} required />
            <button type="submit" className="btn-dark">Add note</button>
          </form>
        </>
      ) : null}
    </Sheet>
  );
}

const blankListing = (p: Product): Listing => ({
  published: false, slug: "", title: p.name, brand: "", shopCategory: SHOP_CATEGORIES[0], fit: "universal",
  description: "", images: [], compareAtPrice: undefined, featured: false, tags: [], fitment: "",
});

function ProductsTab({ products, branch, onChanged }: { products: Product[]; branch: string; onChanged: () => void }) {
  const [filter, setFilter] = useState<"all" | "live" | "draft" | "unlisted">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Listing | null>(null);
  const [tags, setTags] = useState("");
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);
  const [nf, setNf] = useState({ sku: "", name: "", category: "Shop", unit: "pcs", salePrice: "", unitCost: "", quantity: "0" });

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === "live" && !p.shop?.published) return false;
      if (filter === "draft" && (!p.shop || p.shop.published)) return false;
      if (filter === "unlisted" && p.shop) return false;
      return !t || [p.sku, p.name, p.shop?.brand, p.shop?.title].some((x) => x?.toLowerCase().includes(t));
    });
  }, [products, filter, q]);

  function edit(p: Product) {
    setEditing(p);
    setForm(p.shop ? { ...p.shop } : blankListing(p));
    setTags((p.shop?.tags || []).join(", "));
    setErr("");
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing || !form) return;
    try {
      await api(`/api/shop/products/${editing._id}`, {
        method: "PUT",
        json: { ...form, compareAtPrice: form.compareAtPrice || undefined, tags: tags.split(",").map((x) => x.trim()).filter(Boolean) },
      });
      setEditing(null);
      onChanged();
    } catch (er) {
      setErr((er as Error).message);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ item: { _id: string } }>("/api/inventory", {
        method: "POST",
        json: { ...nf, sku: nf.sku.toUpperCase(), salePrice: Number(nf.salePrice), unitCost: Number(nf.unitCost || 0), quantity: Number(nf.quantity || 0), branchCode: branch },
      });
      setCreating(false);
      setNf({ sku: "", name: "", category: "Shop", unit: "pcs", salePrice: "", unitCost: "", quantity: "0" });
      onChanged();
      const fresh: Product = { _id: res.item._id, sku: nf.sku.toUpperCase(), name: nf.name, category: nf.category, unit: nf.unit, salePrice: Number(nf.salePrice), unitCost: Number(nf.unitCost || 0), available: Number(nf.quantity || 0), shop: null };
      edit(fresh);
    } catch (er) {
      setErr((er as Error).message);
    }
  }

  const set = <K extends keyof Listing>(k: K, v: Listing[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <>
      <div className="accounting-toolbar dl-toolbar no-print">
        <div className="chips">
          {(["all", "live", "draft", "unlisted"] as const).map((f) => (
            <button key={f} type="button" className={`filter-chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>{label(f)}</button>
          ))}
        </div>
        <input className={inputClass} placeholder="Search SKU, name, brand…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-primary" onClick={() => { setErr(""); setCreating(true); }}>+ New product</button>
      </div>
      <div className="muted small" style={{ marginBottom: 10 }}>
        Products are inventory items. Price and stock come from Inventory; orders are fulfilled from branch <b>{branch}</b>. Restock through a Purchase voucher in Inventory.
      </div>
      {err && !editing && !creating ? <div className="alert err">{err}</div> : null}
      <Panel>
        <div className="table-scroll">
          <table className="reg">
            <thead><tr><th></th><th>Product</th><th>Shop category</th><th>Fit</th><th className="right">Price</th><th className="right">Stock @ {branch}</th><th>Shop</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id}>
                  <td><div className="dl-thumb" style={p.shop?.images?.[0] ? { backgroundImage: `url("${p.shop.images[0]}")` } : undefined} /></td>
                  <td><b>{p.shop?.title || p.name}</b><div className="muted small">{p.sku}{p.shop?.brand ? ` · ${p.shop.brand}` : ""}</div></td>
                  <td>{p.shop?.shopCategory || "—"}</td>
                  <td>{p.shop ? label(p.shop.fit) : "—"}</td>
                  <td className="num">{pkr(p.salePrice)}</td>
                  <td className="num" style={{ color: p.available <= 0 ? "var(--red)" : undefined }}>{p.available}</td>
                  <td>{p.shop?.published ? <span className="badge present">Live{p.shop.featured ? " ★" : ""}</span> : p.shop ? <span className="badge leave">Draft</span> : <span className="muted small">Not listed</span>}</td>
                  <td className="right">
                    <button type="button" className="link-btn" onClick={() => edit(p)}>{p.shop ? "Edit listing" : "List in shop"}</button>
                    {p.shop?.published ? <a className="link-btn" href={`/shop/${p.shop.slug}`} target="_blank" rel="noreferrer">View ↗</a> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <ModalForm open={creating} title="New shop product" subtitle="Creates the inventory item, then opens its shop listing" onClose={() => setCreating(false)} onSubmit={create} submitLabel="Create & continue">
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="SKU" required><input className={inputClass} value={nf.sku} onChange={(e) => setNf({ ...nf, sku: e.target.value })} required placeholder="OIL-SHELL-HX7-4L" /></Field>
          <Field label="Name" required><input className={inputClass} value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} required placeholder="Shell Helix HX7 10W-40 4L" /></Field>
          <Field label="Sale price" required><input className={inputClass} type="number" min={1} value={nf.salePrice} onChange={(e) => setNf({ ...nf, salePrice: e.target.value })} required /></Field>
          <Field label="Unit cost"><input className={inputClass} type="number" min={0} value={nf.unitCost} onChange={(e) => setNf({ ...nf, unitCost: e.target.value })} /></Field>
          <Field label={`Opening stock at ${branch}`}><input className={inputClass} type="number" min={0} value={nf.quantity} onChange={(e) => setNf({ ...nf, quantity: e.target.value })} /></Field>
          <Field label="Unit"><input className={inputClass} value={nf.unit} onChange={(e) => setNf({ ...nf, unit: e.target.value })} /></Field>
        </div>
      </ModalForm>

      <ModalForm open={Boolean(editing && form)} wide title={editing ? `Shop listing — ${editing.sku}` : ""} subtitle={editing ? `Price ${pkr(editing.salePrice)} · stock ${editing.available} (change these in Inventory)` : undefined} onClose={() => setEditing(null)} onSubmit={save} submitLabel="Save listing">
        {err ? <div className="alert err">{err}</div> : null}
        {form ? (
          <>
            <div className="form-section-title">Photos</div>
            <ImageUploader value={form.images} onChange={(v) => set("images", v)} endpoint="/api/uploads/image" max={12} />
            <div className="form-section-title">Listing</div>
            <div className="form-grid three">
              <Field label="Title"><input className={inputClass} value={form.title || ""} onChange={(e) => set("title", e.target.value)} /></Field>
              <Field label="Brand"><input className={inputClass} value={form.brand || ""} onChange={(e) => set("brand", e.target.value)} placeholder="Shell, Castrol, Bosch…" /></Field>
              <Field label="Shop category" required>
                <select className={inputClass} value={form.shopCategory} onChange={(e) => set("shopCategory", e.target.value)}>
                  {SHOP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="For">
                <select className={inputClass} value={form.fit} onChange={(e) => set("fit", e.target.value as Listing["fit"])}>
                  {FIT_TYPES.map((f) => <option key={f} value={f}>{f === "universal" ? "Cars & bikes" : label(f) + "s"}</option>)}
                </select>
              </Field>
              <Field label="Compare-at price (was)"><input className={inputClass} type="number" min={0} value={form.compareAtPrice ?? ""} onChange={(e) => set("compareAtPrice", e.target.value ? Number(e.target.value) : undefined)} /></Field>
              <Field label="URL slug"><input className={inputClass} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="auto from title" /></Field>
            </div>
            <Field label="Search tags (comma separated)"><input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="10w40, synthetic, engine oil" /></Field>
            <Field label="Fits / compatibility"><textarea className={inputClass} rows={2} value={form.fitment || ""} onChange={(e) => set("fitment", e.target.value)} placeholder="Toyota Corolla 2014–2024, Honda Civic 2016+" /></Field>
            <Field label="Description"><textarea className={inputClass} rows={4} value={form.description || ""} onChange={(e) => set("description", e.target.value)} /></Field>
            <div className="form-grid">
              <label className="check-row"><input type="checkbox" checked={form.published} onChange={(e) => set("published", e.target.checked)} /> Live on the shop</label>
              <label className="check-row"><input type="checkbox" checked={form.featured} onChange={(e) => set("featured", e.target.checked)} /> Featured (shown first)</label>
            </div>
          </>
        ) : null}
      </ModalForm>
    </>
  );
}

function SettingsTab({ settings, isAdmin, onSaved }: { settings: Settings; isAdmin: boolean; onSaved: () => void }) {
  const [f, setF] = useState<Settings>(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => setBranches(d.settings?.branches || [])).catch(() => undefined);
  }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/shop", { method: "PUT", json: f });
      setMsg({ ok: true, text: "Settings saved" });
      onSaved();
    } catch (er) {
      setMsg({ ok: false, text: (er as Error).message });
    }
  }

  return (
    <Panel title="Shop & marketplace settings" meta={isAdmin ? undefined : "Read-only: admin only"}>
      <form onSubmit={save}>
        {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
        <fieldset disabled={!isAdmin} style={{ border: 0 }}>
          <div className="form-section-title">Shop</div>
          <label className="check-row"><input type="checkbox" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Shop is open for orders</label>
          <div className="form-grid three">
            <Field label="Fulfil orders from branch">
              <select className={inputClass} value={f.fulfilmentBranch} onChange={(e) => set("fulfilmentBranch", e.target.value)}>
                {(branches.length ? branches : [{ code: f.fulfilmentBranch, name: f.fulfilmentBranch }]).map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
              </select>
            </Field>
            <Field label="Delivery fee (PKR)"><input className={inputClass} type="number" min={0} value={f.deliveryFee} onChange={(e) => set("deliveryFee", Number(e.target.value))} /></Field>
            <Field label="Free delivery over (0 = never)"><input className={inputClass} type="number" min={0} value={f.freeDeliveryOver} onChange={(e) => set("freeDeliveryOver", Number(e.target.value))} /></Field>
          </div>
          <div className="form-section-title">Payment</div>
          <label className="check-row"><input type="checkbox" checked={f.codEnabled} onChange={(e) => set("codEnabled", e.target.checked)} /> Cash on delivery</label>
          <label className="check-row"><input type="checkbox" checked={f.bankTransferEnabled} onChange={(e) => set("bankTransferEnabled", e.target.checked)} /> Bank transfer</label>
          {f.bankTransferEnabled ? (
            <Field label="Bank details shown to the customer after ordering"><textarea className={inputClass} rows={3} value={f.bankDetails || ""} onChange={(e) => set("bankDetails", e.target.value)} placeholder={"Bank: …\nAccount title: …\nIBAN: PK…"} /></Field>
          ) : null}
          <div className="form-section-title">Private ads (classifieds)</div>
          <label className="check-row"><input type="checkbox" checked={f.classifiedsEnabled} onChange={(e) => set("classifiedsEnabled", e.target.checked)} /> Let the public post car & bike ads</label>
          <label className="check-row"><input type="checkbox" checked={f.moderateAds} onChange={(e) => set("moderateAds", e.target.checked)} /> Review ads before they go live (recommended)</label>
          {isAdmin ? <div className="form-actions"><button type="submit" className="btn-dark">Save settings</button></div> : null}
        </fieldset>
      </form>
    </Panel>
  );
}
