"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatPKR } from "@/lib/dealership";
import { CART_EVENT, addToCart, cartCount, readCart, writeCart, type CartLine } from "./cart";

export function CartBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(cartCount());
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <Link href="/shop/cart" className="mk-cart-badge" aria-label={`Cart, ${n} items`}>
      🛒{n ? <span>{n}</span> : null}
    </Link>
  );
}

export function AddToCart({ productId, available, compact }: { productId: string; available: number; compact?: boolean }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  if (available <= 0) return <button type="button" className="site-btn ghost" disabled>Out of stock</button>;
  const max = Math.min(10, available);
  function add() {
    addToCart(productId, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  }
  return (
    <div className="mk-add">
      {!compact ? (
        <div className="mk-qty">
          <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less">−</button>
          <span>{qty}</span>
          <button type="button" onClick={() => setQty(Math.min(max, qty + 1))} aria-label="More">+</button>
        </div>
      ) : null}
      <button type="button" className="site-btn" onClick={add}>{added ? "Added ✓" : "Add to cart"}</button>
      {added && !compact ? <Link href="/shop/cart" className="site-link">View cart →</Link> : null}
    </div>
  );
}

type QuoteLine = {
  product: { _id: string; slug: string; title: string; price: number; images: string[]; available: number; inStock: boolean };
  qty: number;
  lineTotal: number;
  problem: string | null;
};
type Quote = {
  lines: QuoteLine[];
  quote: { subtotal: number; delivery: number; total: number; freeOver: number };
  payment: { cod: boolean; bankTransfer: boolean; bankDetails?: string };
  enabled: boolean;
};

export function CartApp() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [q, setQ] = useState<Quote | null>(null);
  const [f, setF] = useState({ customerName: "", phone: "", email: "", address: "", city: "", notes: "", paymentMethod: "cod", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState<{ number: string; total: number; paymentMethod: string; bankDetails?: string } | null>(null);

  const refresh = useCallback(async (next: CartLine[]) => {
    try {
      const res = await fetch("/api/site/shop/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: next }) });
      const data: Quote = await res.json();
      setQ(data);
      // Drop products that disappeared from the catalogue.
      const known = new Set(data.lines.map((l) => l.product._id));
      if (next.some((l) => !known.has(l.productId))) writeCart(next.filter((l) => known.has(l.productId)));
    } catch {
      setError("Could not load your cart. Please refresh.");
    }
  }, []);

  useEffect(() => {
    const initial = readCart();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(initial);
    refresh(initial);
    fetch("/api/site/member/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.member) setF((x) => ({ ...x, customerName: x.customerName || d.member.name, phone: x.phone || d.member.phone, city: x.city || d.member.city || "" }));
    }).catch(() => undefined);
  }, [refresh]);

  function setQty(productId: string, qty: number) {
    const next = qty <= 0 ? lines.filter((l) => l.productId !== productId) : lines.map((l) => (l.productId === productId ? { ...l, qty: Math.min(10, qty) } : l));
    setLines(next);
    writeCart(next);
    refresh(next);
  }

  async function checkout(e: FormEvent) {
    e.preventDefault();
    if (!q) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/site/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, items: lines, expectedTotal: q.quote.total }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await refresh(lines);
        throw new Error(data.error || "Could not place the order");
      }
      writeCart([]);
      setLines([]);
      setPlaced(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    return (
      <div className="site-card mk-placed">
        <h3>Order placed ✓</h3>
        <p>Order number <b>{placed.number}</b> · total <b>{formatPKR(placed.total)}</b></p>
        {placed.paymentMethod === "bank_transfer" ? (
          <div className="mk-callout">
            <b>Please transfer the total to:</b>
            <pre>{placed.bankDetails || "Our team will share bank details by phone."}</pre>
            Use <b>{placed.number}</b> as the payment reference. We confirm and dispatch once payment is received.
          </div>
        ) : (
          <p>Pay in cash when your order arrives. We will call to confirm before dispatch.</p>
        )}
        <p><Link className="site-link" href={`/shop/track?number=${placed.number}`}>Track this order →</Link></p>
      </div>
    );
  }
  if (!q) return <p className="mk-muted">Loading your cart…</p>;
  if (!q.lines.length) {
    return <div className="site-card"><h3>Your cart is empty</h3><p><Link href="/shop" className="site-btn">Browse products</Link></p></div>;
  }
  const blocked = q.lines.some((l) => l.problem) || !q.enabled;
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const toFree = q.quote.freeOver > 0 && q.quote.delivery > 0 ? q.quote.freeOver - q.quote.subtotal : 0;

  return (
    <div className="mk-cart">
      <div>
        <div className="site-card">
          {q.lines.map((l) => (
            <div key={l.product._id} className="mk-cart-line">
              <div className="mk-cart-img" style={l.product.images[0] ? { backgroundImage: `url("${l.product.images[0]}")` } : undefined} />
              <div>
                <Link href={`/shop/${l.product.slug}`} className="mk-cart-title">{l.product.title}</Link>
                <div className="mk-muted">{formatPKR(l.product.price)} each</div>
                {l.problem ? <div className="mk-error">{l.problem}</div> : null}
              </div>
              <div className="mk-qty">
                <button type="button" onClick={() => setQty(l.product._id, l.qty - 1)} aria-label="Less">−</button>
                <span>{l.qty}</span>
                <button type="button" onClick={() => setQty(l.product._id, l.qty + 1)} disabled={l.qty >= Math.min(10, l.product.available)} aria-label="More">+</button>
              </div>
              <b>{formatPKR(l.lineTotal)}</b>
              <button type="button" className="mk-link danger" onClick={() => setQty(l.product._id, 0)}>Remove</button>
            </div>
          ))}
        </div>

        <form className="site-form" style={{ marginTop: 16 }} onSubmit={checkout}>
          <div className="site-form-section">Delivery details</div>
          <div className="site-form-grid">
            <label>Full name<input value={f.customerName} onChange={(e) => set("customerName", e.target.value)} required minLength={2} autoComplete="name" /></label>
            <label>Mobile number<input value={f.phone} onChange={(e) => set("phone", e.target.value)} required inputMode="tel" autoComplete="tel" /></label>
            <label>Email (optional)<input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" /></label>
            <label>City<input value={f.city} onChange={(e) => set("city", e.target.value)} required autoComplete="address-level2" /></label>
          </div>
          <label className="site-form-wide">Full address<textarea rows={2} value={f.address} onChange={(e) => set("address", e.target.value)} required minLength={8} autoComplete="street-address" /></label>
          <label className="site-form-wide">Order notes (optional)<input value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Vehicle model for fitment, delivery timing…" /></label>
          <div className="site-form-section">Payment</div>
          <div className="mk-pay">
            {q.payment.cod ? <label><input type="radio" name="pay" checked={f.paymentMethod === "cod"} onChange={() => set("paymentMethod", "cod")} /> Cash on delivery</label> : null}
            {q.payment.bankTransfer ? <label><input type="radio" name="pay" checked={f.paymentMethod === "bank_transfer"} onChange={() => set("paymentMethod", "bank_transfer")} /> Bank transfer</label> : null}
          </div>
          <input className="mk-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} aria-hidden="true" />
          {error ? <div className="mk-error" style={{ marginTop: 10 }}>{error}</div> : null}
          {!q.enabled ? <div className="mk-error">The shop is not taking orders right now.</div> : null}
          <button type="submit" className="site-btn" style={{ marginTop: 14 }} disabled={busy || blocked}>
            {busy ? "Placing order…" : `Place order · ${formatPKR(q.quote.total)}`}
          </button>
        </form>
      </div>

      <aside className="site-card mk-summary">
        <h3>Order summary</h3>
        <div><span>Subtotal</span><b>{formatPKR(q.quote.subtotal)}</b></div>
        <div><span>Delivery</span><b>{q.quote.delivery ? formatPKR(q.quote.delivery) : "Free"}</b></div>
        {toFree > 0 ? <p className="mk-muted">Add {formatPKR(toFree)} more for free delivery.</p> : null}
        <div className="total"><span>Total</span><b>{formatPKR(q.quote.total)}</b></div>
      </aside>
    </div>
  );
}

type Tracked = {
  number: string; status: string; total: number; subtotal: number; deliveryFee: number; paymentMethod: string; paymentStatus: string;
  courier?: string; trackingNumber?: string; createdAt: string;
  lines: { title: string; qty: number; lineTotal: number }[];
  events: { status: string; at: string; note?: string }[];
};

const STEPS = ["pending", "confirmed", "dispatched", "delivered"];

export function TrackOrder({ initialNumber }: { initialNumber?: string }) {
  const [form, setForm] = useState({ number: initialNumber || "", phone: "" });
  const [order, setOrder] = useState<Tracked | null>(null);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOrder(null);
    const res = await fetch("/api/site/shop/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "Order not found");
    else setOrder(data.order);
  }

  const stepIndex = order ? STEPS.indexOf(order.status) : -1;
  return (
    <>
      <form className="site-form mk-track" onSubmit={submit}>
        <div className="site-form-grid">
          <label>Order number<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required placeholder="SO-2026-00001" /></label>
          <label>Mobile used for the order<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required inputMode="tel" /></label>
        </div>
        <button type="submit" className="site-btn" style={{ marginTop: 12 }}>Track order</button>
        {error ? <div className="mk-error" style={{ marginTop: 10 }}>{error}</div> : null}
      </form>
      {order ? (
        <div className="site-card" style={{ marginTop: 16 }}>
          <h3>{order.number}</h3>
          {order.status === "cancelled" || order.status === "returned" ? (
            <p className="mk-error">This order was {order.status}.</p>
          ) : (
            <ol className="mk-steps-track">
              {STEPS.map((s, i) => (
                <li key={s} className={i <= stepIndex ? "done" : ""}><span>{i + 1}</span>{s[0].toUpperCase() + s.slice(1)}</li>
              ))}
            </ol>
          )}
          {order.trackingNumber ? <p>Courier: <b>{order.courier}</b> · tracking <b>{order.trackingNumber}</b></p> : null}
          <ul className="mk-msgs">
            {order.lines.map((l, i) => <li key={i}>{l.qty}× {l.title} — {formatPKR(l.lineTotal)}</li>)}
          </ul>
          <p>Total <b>{formatPKR(order.total)}</b> · {order.paymentMethod === "cod" ? "Cash on delivery" : "Bank transfer"} · payment {order.paymentStatus}</p>
        </div>
      ) : null}
    </>
  );
}
