"use client";

import { FormEvent, useMemo, useState } from "react";
import { financeSummary, formatPKR } from "@/lib/dealership";

export function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [i, setI] = useState(0);
  if (!photos.length) return <div className="mk-gallery-main empty">No photos yet</div>;
  return (
    <div>
      <div className="mk-gallery-main" style={{ backgroundImage: `url("${photos[i]}")` }} role="img" aria-label={`${title} photo ${i + 1}`}>
        {photos.length > 1 ? (
          <>
            <button type="button" className="mk-nav prev" onClick={() => setI((i - 1 + photos.length) % photos.length)} aria-label="Previous photo">‹</button>
            <button type="button" className="mk-nav next" onClick={() => setI((i + 1) % photos.length)} aria-label="Next photo">›</button>
            <span className="mk-photo-count">{i + 1} / {photos.length}</span>
          </>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <div className="mk-thumbs">
          {photos.map((p, idx) => (
            <button key={p} type="button" className={idx === i ? "active" : ""} style={{ backgroundImage: `url("${p}")` }} onClick={() => setI(idx)} aria-label={`Show photo ${idx + 1}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EmiCalculator({ price }: { price: number }) {
  const [downPct, setDownPct] = useState(30);
  const [rate, setRate] = useState(18);
  const [months, setMonths] = useState(36);
  const down = Math.round((price * downPct) / 100);
  const result = useMemo(() => financeSummary(price - down, rate, months), [price, down, rate, months]);
  return (
    <div className="mk-emi">
      <label>
        Down payment <b>{downPct}% · {formatPKR(down)}</b>
        <input type="range" min={20} max={80} step={5} value={downPct} onChange={(e) => setDownPct(Number(e.target.value))} />
      </label>
      <label>
        Markup rate <b>{rate}% p.a.</b>
        <input type="range" min={8} max={30} step={0.5} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      </label>
      <label>
        Tenure
        <div className="mk-chips">
          {[12, 24, 36, 48, 60].map((m) => (
            <button key={m} type="button" className={m === months ? "active" : ""} onClick={() => setMonths(m)}>
              {m / 12} yr
            </button>
          ))}
        </div>
      </label>
      <div className="mk-emi-result">
        <span>Estimated monthly instalment</span>
        <b>{formatPKR(result.emi)}</b>
        <small>
          Financed {formatPKR(price - down)} · total markup {formatPKR(result.totalInterest)}. Indicative only; final terms depend on the bank.
        </small>
      </div>
    </div>
  );
}

type Intent = "buy" | "test_drive" | "finance" | "offer";

export function ShowPhone({ phone }: { phone: string }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <a className="site-btn" href={`tel:${phone}`} style={{ marginBottom: 10, display: "inline-flex" }}>📞 {phone}</a>
  ) : (
    <button type="button" className="site-btn" style={{ marginBottom: 10 }} onClick={() => setShown(true)}>
      📞 Show phone number
    </button>
  );
}

export function InquiryForm({ listingId, phone, privateSeller }: { listingId: string; phone?: string; privateSeller?: boolean }) {
  const [intent, setIntent] = useState<Intent>("buy");
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "", offerPrice: "", website: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch(`/api/site/cars/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, intent, offerPrice: form.offerPrice ? Number(form.offerPrice) : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send your message");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="mk-contact sent">
        <b>Thanks, {form.name.split(" ")[0]}!</b>
        <p>
          {privateSeller ? "Your message was sent to the seller." : "Our sales team will call you shortly"}
          {phone ? <> — or call us now on <a href={`tel:${phone}`}>{phone}</a></> : null}.
        </p>
      </div>
    );
  }

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <form className="mk-contact" onSubmit={submit}>
      <div className="mk-chips">
        {(privateSeller
          ? ([["buy", "I'm interested"], ["test_drive", "View in person"], ["offer", "Make offer"]] as const)
          : ([["buy", "I'm interested"], ["test_drive", "Test drive"], ["finance", "Financing"], ["offer", "Make offer"]] as const)
        ).map(([k, l]) => (
          <button key={k} type="button" className={intent === k ? "active" : ""} onClick={() => setIntent(k)}>{l}</button>
        ))}
      </div>
      <input placeholder="Your name" value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
      <input placeholder="Mobile number (03xx-xxxxxxx)" value={form.phone} onChange={(e) => set("phone", e.target.value)} required inputMode="tel" />
      <input placeholder="Email (optional)" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
      {intent === "offer" ? (
        <input placeholder="Your offer (PKR)" type="number" min={0} value={form.offerPrice} onChange={(e) => set("offerPrice", e.target.value)} required />
      ) : null}
      <textarea placeholder="Message (optional)" rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} />
      {/* Honeypot: hidden from people, filled by bots. */}
      <input className="mk-hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} aria-hidden="true" />
      {error ? <div className="mk-error">{error}</div> : null}
      <button type="submit" className="site-btn" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : privateSeller ? "Message seller" : "Contact dealer"}
      </button>
      {phone ? <a className="site-btn ghost" href={`tel:${phone}`}>📞 Call {phone}</a> : null}
    </form>
  );
}

export function SellCarForm() {
  const year = new Date().getFullYear();
  const [form, setForm] = useState({
    name: "", phone: "", city: "", make: "", model: "", year: String(year - 5), mileage: "",
    registrationNo: "", condition: "Good", expectedPrice: "", message: "", website: "",
  });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/site/sell-car", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          year: Number(form.year),
          mileage: Number(form.mileage || 0),
          expectedPrice: form.expectedPrice ? Number(form.expectedPrice) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not submit your request");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="site-form">
        <h3>Request received ✓</h3>
        <p>Our evaluator will call you to book a free inspection of your {form.year} {form.make} {form.model}.</p>
      </div>
    );
  }

  return (
    <form className="site-form" onSubmit={submit}>
      <div className="site-form-section">Your car</div>
      <div className="site-form-grid">
        <label>Make<input value={form.make} onChange={(e) => set("make", e.target.value)} required placeholder="Toyota" /></label>
        <label>Model<input value={form.model} onChange={(e) => set("model", e.target.value)} required placeholder="Corolla" /></label>
        <label>Model year
          <select value={form.year} onChange={(e) => set("year", e.target.value)}>
            {Array.from({ length: 35 }, (_, k) => year - k).map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <label>Mileage (km)<input type="number" min={0} value={form.mileage} onChange={(e) => set("mileage", e.target.value)} required /></label>
        <label>Registration no.<input value={form.registrationNo} onChange={(e) => set("registrationNo", e.target.value)} placeholder="LEA-19-1234" /></label>
        <label>Condition
          <select value={form.condition} onChange={(e) => set("condition", e.target.value)}>
            {["Excellent", "Good", "Fair", "Needs work"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Expected price (PKR)<input type="number" min={0} value={form.expectedPrice} onChange={(e) => set("expectedPrice", e.target.value)} /></label>
      </div>
      <div className="site-form-section">Your details</div>
      <div className="site-form-grid">
        <label>Full name<input value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} /></label>
        <label>Mobile number<input value={form.phone} onChange={(e) => set("phone", e.target.value)} required inputMode="tel" placeholder="03xx-xxxxxxx" /></label>
        <label>City<input value={form.city} onChange={(e) => set("city", e.target.value)} required /></label>
      </div>
      <label className="site-form-wide">Anything else?<textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} /></label>
      <input className="mk-hp" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set("website", e.target.value)} aria-hidden="true" />
      {error ? <div className="mk-error">{error}</div> : null}
      <button type="submit" className="site-btn" style={{ marginTop: 16 }} disabled={state === "sending"}>
        {state === "sending" ? "Submitting…" : "Get my free valuation"}
      </button>
    </form>
  );
}
