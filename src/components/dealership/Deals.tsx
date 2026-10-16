"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, ModalForm, Panel, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";
import {
  DEAL_STATUSES,
  DEAL_STEPS,
  amortization,
  dealTotals,
  financeSummary,
} from "@/lib/dealership";
import { Customer, Deal, Pill, Sheet, Stat, Vehicle, api, label, pkr, withBranch } from "./shared";

export type DealPrefill = { customerId?: string; vehicleId?: string } | null;

type DealForm = {
  customerId: string;
  vehicleId: string;
  salesperson: string;
  salePrice: string;
  discount: string;
  includeTradeIn: boolean;
  tradeInAllowance: string;
  tradeInPayoff: string;
  taxAmount: string;
  registrationFee: string;
  otherFees: string;
  commissionRate: string;
  useFinance: boolean;
  lender: string;
  downPayment: string;
  annualRate: string;
  tenureMonths: string;
  notes: string;
  reserve: boolean;
};

const blank: DealForm = {
  customerId: "",
  vehicleId: "",
  salesperson: "",
  salePrice: "",
  discount: "0",
  includeTradeIn: false,
  tradeInAllowance: "0",
  tradeInPayoff: "0",
  taxAmount: "0",
  registrationFee: "0",
  otherFees: "0",
  commissionRate: "10",
  useFinance: false,
  lender: "",
  downPayment: "0",
  annualRate: "18",
  tenureMonths: "36",
  notes: "",
  reserve: true,
};

const num = (v: string) => Number(v || 0);

function formTotals(f: DealForm) {
  const t = dealTotals(
    {
      salePrice: num(f.salePrice),
      discount: num(f.discount),
      tradeInAllowance: f.includeTradeIn ? num(f.tradeInAllowance) : 0,
      tradeInPayoff: f.includeTradeIn ? num(f.tradeInPayoff) : 0,
      taxAmount: num(f.taxAmount),
      registrationFee: num(f.registrationFee),
      otherFees: num(f.otherFees),
    },
    0,
    0
  );
  const financed = f.useFinance ? Math.max(0, t.payable - num(f.downPayment)) : 0;
  return { ...t, financed, ...financeSummary(financed, num(f.annualRate), num(f.tenureMonths)) };
}

function payload(f: DealForm) {
  const t = formTotals(f);
  return {
    customerId: f.customerId,
    vehicleId: f.vehicleId,
    salesperson: f.salesperson,
    salePrice: num(f.salePrice),
    discount: num(f.discount),
    includeTradeIn: f.includeTradeIn,
    tradeInAllowance: num(f.tradeInAllowance),
    tradeInPayoff: num(f.tradeInPayoff),
    taxAmount: num(f.taxAmount),
    registrationFee: num(f.registrationFee),
    otherFees: num(f.otherFees),
    commissionRate: num(f.commissionRate),
    financing: f.useFinance
      ? {
          status: "none",
          lender: f.lender,
          downPayment: num(f.downPayment),
          amount: t.financed,
          annualRate: num(f.annualRate),
          tenureMonths: num(f.tenureMonths),
        }
      : undefined,
    notes: f.notes,
    reserve: f.reserve,
  };
}

export function DealershipDeals({
  branch,
  isAdmin,
  userName,
  prefill,
  onPrefillHandled,
}: {
  branch: string;
  isAdmin: boolean;
  userName: string;
  prefill: DealPrefill;
  onPrefillHandled: () => void;
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [status, setStatus] = useState("open");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [form, setForm] = useState<DealForm>(blank);
  const [formError, setFormError] = useState("");
  const [deskId, setDeskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, v, c] = await Promise.all([
        api<{ deals: Deal[] }>(withBranch("/api/dealership/deals", branch)),
        api<{ vehicles: Vehicle[] }>(withBranch("/api/dealership/vehicles", branch)),
        api<{ customers: Customer[] }>(withBranch("/api/dealership/customers", branch)),
      ]);
      setDeals(d.deals);
      setVehicles(v.vehicles);
      setCustomers(c.customers);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [branch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v._id, v])), [vehicles]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c._id, c])), [customers]);

  const pickVehicle = useCallback(
    (f: DealForm, vehicleId: string): DealForm => {
      const v = vehicleById.get(vehicleId);
      return { ...f, vehicleId, salePrice: v ? String(v.listPrice) : f.salePrice };
    },
    [vehicleById]
  );

  const pickCustomer = useCallback(
    (f: DealForm, customerId: string): DealForm => {
      const c = customerById.get(customerId);
      const t = c?.tradeIn;
      return {
        ...f,
        customerId,
        salesperson: f.salesperson || c?.assignedTo || userName,
        includeTradeIn: Boolean(t?.make),
        tradeInAllowance: String(t?.offeredValue || 0),
        tradeInPayoff: String(t?.payoff || 0),
        useFinance: f.useFinance || Boolean(c?.wantsFinancing),
      };
    },
    [customerById, userName]
  );

  const openNew = useCallback(
    (pre?: DealPrefill) => {
      let f: DealForm = { ...blank, salesperson: userName };
      if (pre?.customerId) f = pickCustomer(f, pre.customerId);
      if (pre?.vehicleId) f = pickVehicle(f, pre.vehicleId);
      setEditing(null);
      setForm(f);
      setFormError("");
      setFormOpen(true);
    },
    [pickCustomer, pickVehicle, userName]
  );

  useEffect(() => {
    // Wait for lookups so the prefilled vehicle price / trade-in resolve.
    if (prefill && vehicles.length + customers.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      openNew(prefill);
      onPrefillHandled();
    }
  }, [prefill, vehicles.length, customers.length, openNew, onPrefillHandled]);

  function openEdit(d: Deal) {
    setEditing(d);
    setForm({
      customerId: d.customerId,
      vehicleId: d.vehicleId,
      salesperson: d.salesperson || "",
      salePrice: String(d.salePrice),
      discount: String(d.discount),
      includeTradeIn: d.tradeInAllowance > 0,
      tradeInAllowance: String(d.tradeInAllowance),
      tradeInPayoff: String(d.tradeInPayoff),
      taxAmount: String(d.taxAmount),
      registrationFee: String(d.registrationFee),
      otherFees: String(d.otherFees),
      commissionRate: String(d.commissionRate),
      useFinance: d.financing?.amount > 0,
      lender: d.financing?.lender || "",
      downPayment: String(d.financing?.downPayment || 0),
      annualRate: String(d.financing?.annualRate || 18),
      tenureMonths: String(d.financing?.tenureMonths || 36),
      notes: d.notes || "",
      reserve: d.status !== "quote",
    });
    setFormError("");
    setFormOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const body = payload(form);
      if (editing && body.financing) {
        // Keep the lender decision; the desk only reshapes the numbers.
        body.financing.status = editing.financing?.status || "none";
      }
      const res = await api<{ deal: Deal }>(editing ? `/api/dealership/deals/${editing._id}` : "/api/dealership/deals", {
        method: editing ? "PUT" : "POST",
        json: body,
      });
      setFormOpen(false);
      await load();
      setDeskId(res.deal._id);
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const shown = deals.filter((d) =>
    status === "open" ? ["quote", "reserved", "financing"].includes(d.status) : !status || d.status === status
  );
  const live = formTotals(form);
  const selVehicle = vehicleById.get(form.vehicleId);
  const net = num(form.salePrice) - num(form.discount);
  const belowFloor = selVehicle && selVehicle.floorPrice > 0 && net < selVehicle.floorPrice;
  const set = <K extends keyof DealForm>(key: K, value: DealForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const selectableVehicles = vehicles.filter((v) => v._id === form.vehicleId || (v.status !== "sold" && v.status !== "reserved"));

  return (
    <>
      <div className="accounting-toolbar no-print dl-toolbar">
        <div className="chips">
          {["open", ...DEAL_STATUSES, ""].map((s) => (
            <button key={s || "all"} type="button" className={`filter-chip${status === s ? " active" : ""}`} onClick={() => setStatus(s)}>
              {s === "open" ? "Open" : s ? label(s) : "All"} ({s === "open" ? deals.filter((d) => ["quote", "reserved", "financing"].includes(d.status)).length : s ? deals.filter((d) => d.status === s).length : deals.length})
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={() => openNew()}>+ New deal</button>
      </div>
      {error ? <div className="alert err">{error}</div> : null}

      <Panel>
        {shown.length ? (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Deal</th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th className="right">Payable</th>
                  <th className="right">Balance</th>
                  <th className="right">Gross</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => {
                  const done = DEAL_STEPS.filter((s) => d.steps?.[s.key]).length;
                  return (
                    <tr key={d._id} onClick={() => setDeskId(d._id)} style={{ cursor: "pointer" }}>
                      <td><b>{d.number}</b><div className="muted small">{prettyDate(d.createdAt)} · {d.salesperson || "—"}</div></td>
                      <td>{d.customerName}</td>
                      <td>{d.vehicleLabel}<div className="muted small">{d.stockNo}</div></td>
                      <td><Pill value={d.status} />{d.financing?.status && d.financing.status !== "none" ? <div className="small muted">Finance: {d.financing.status}</div> : null}</td>
                      <td>
                        <div className="dl-mini-steps" title={`${done}/${DEAL_STEPS.length} steps`}>
                          {DEAL_STEPS.map((s) => <span key={s.key} className={d.steps?.[s.key] ? "on" : ""} />)}
                        </div>
                      </td>
                      <td className="num">{pkr(d.totals.payable)}</td>
                      <td className="num" style={{ color: d.totals.balance > 0 && d.status !== "cancelled" ? "#96650f" : undefined }}>{pkr(d.totals.balance)}</td>
                      <td className="num">{d.grossProfit != null ? pkr(d.grossProfit) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="No deals in this view." />
        )}
      </Panel>

      <ModalForm
        open={formOpen}
        wide
        title={editing ? `Desk ${editing.number}` : "Write a deal"}
        subtitle="Totals and instalments update as you type"
        onClose={() => setFormOpen(false)}
        onSubmit={save}
        submitLabel={editing ? "Update deal" : "Create deal"}
      >
        {formError ? <div className="alert err">{formError}</div> : null}
        <div className="dl-deal-form">
          <div>
            <div className="form-grid">
              <Field label="Customer" required>
                <select className={inputClass} value={form.customerId} onChange={(e) => setForm((f) => pickCustomer(f, e.target.value))} required disabled={Boolean(editing)}>
                  <option value="">Select customer</option>
                  {customers.filter((c) => c.stage !== "lost" || c._id === form.customerId).map((c) => (
                    <option key={c._id} value={c._id}>{c.name} {c.phone ? `· ${c.phone}` : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Vehicle" required>
                <select className={inputClass} value={form.vehicleId} onChange={(e) => setForm((f) => pickVehicle(f, e.target.value))} required disabled={Boolean(editing)}>
                  <option value="">Select vehicle</option>
                  {selectableVehicles.map((v) => (
                    <option key={v._id} value={v._id}>{v.stockNo} · {v.label} · {pkr(v.listPrice)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="form-grid three">
              <Field label="Sale price" required><input className={inputClass} type="number" min={0} value={form.salePrice} onChange={(e) => set("salePrice", e.target.value)} required /></Field>
              <Field label="Discount"><input className={inputClass} type="number" min={0} value={form.discount} onChange={(e) => set("discount", e.target.value)} /></Field>
              <Field label="Salesperson"><input className={inputClass} value={form.salesperson} onChange={(e) => set("salesperson", e.target.value)} /></Field>
              <Field label="Tax / duties"><input className={inputClass} type="number" min={0} value={form.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} /></Field>
              <Field label="Registration / transfer"><input className={inputClass} type="number" min={0} value={form.registrationFee} onChange={(e) => set("registrationFee", e.target.value)} /></Field>
              <Field label="Other fees"><input className={inputClass} type="number" min={0} value={form.otherFees} onChange={(e) => set("otherFees", e.target.value)} /></Field>
            </div>
            {belowFloor ? (
              <div className={`alert ${isAdmin ? "" : "err"}`}>
                Net {pkr(net)} is below the floor of {pkr(selVehicle!.floorPrice)}. {isAdmin ? "You're approving as manager." : "A manager (admin) must save this deal."}
              </div>
            ) : null}
            <label className="check-row">
              <input type="checkbox" checked={form.includeTradeIn} onChange={(e) => set("includeTradeIn", e.target.checked)} /> Include trade-in
            </label>
            {form.includeTradeIn ? (
              <div className="form-grid">
                <Field label="Trade-in allowance"><input className={inputClass} type="number" min={0} value={form.tradeInAllowance} onChange={(e) => set("tradeInAllowance", e.target.value)} /></Field>
                <Field label="Loan payoff on trade"><input className={inputClass} type="number" min={0} value={form.tradeInPayoff} onChange={(e) => set("tradeInPayoff", e.target.value)} /></Field>
              </div>
            ) : null}
            <label className="check-row">
              <input type="checkbox" checked={form.useFinance} onChange={(e) => set("useFinance", e.target.checked)} /> Bank / lease financing
            </label>
            {form.useFinance ? (
              <div className="form-grid three">
                <Field label="Lender"><input className={inputClass} value={form.lender} onChange={(e) => set("lender", e.target.value)} placeholder="Meezan, HBL, Bank Alfalah…" /></Field>
                <Field label="Down payment"><input className={inputClass} type="number" min={0} value={form.downPayment} onChange={(e) => set("downPayment", e.target.value)} /></Field>
                <Field label="Rate % p.a."><input className={inputClass} type="number" min={0} step="0.1" value={form.annualRate} onChange={(e) => set("annualRate", e.target.value)} /></Field>
                <Field label="Tenure (months)">
                  <select className={inputClass} value={form.tenureMonths} onChange={(e) => set("tenureMonths", e.target.value)}>
                    {[12, 24, 36, 48, 60, 72, 84].map((m) => <option key={m} value={m}>{m} months</option>)}
                  </select>
                </Field>
              </div>
            ) : null}
            <div className="form-grid">
              <Field label="Commission % of gross"><input className={inputClass} type="number" min={0} max={100} value={form.commissionRate} onChange={(e) => set("commissionRate", e.target.value)} /></Field>
              {!editing ? (
                <label className="check-row" style={{ alignSelf: "end" }}>
                  <input type="checkbox" checked={form.reserve} onChange={(e) => set("reserve", e.target.checked)} /> Reserve vehicle now
                </label>
              ) : <div />}
            </div>
            <Field label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          </div>
          <aside className="dl-summary">
            <div className="form-section-title">Deal sheet</div>
            <div><span>Vehicle (net of discount)</span><b>{pkr(live.vehicleNet)}</b></div>
            <div><span>Tax + registration + fees</span><b>{pkr(live.total - live.vehicleNet)}</b></div>
            {form.includeTradeIn ? <div><span>Net trade-in credit</span><b>− {pkr(live.netTradeIn)}</b></div> : null}
            <div className="total"><span>Customer pays</span><b>{pkr(live.payable)}</b></div>
            {form.useFinance ? (
              <>
                <div><span>Down payment</span><b>{pkr(num(form.downPayment))}</b></div>
                <div><span>Financed</span><b>{pkr(live.financed)}</b></div>
                <div className="dl-emi"><span>Monthly instalment</span><b>{pkr(live.emi)}</b></div>
                <div><span>Total interest</span><b>{pkr(live.totalInterest)}</b></div>
              </>
            ) : null}
            {selVehicle ? (
              <>
                <div className="form-section-title" style={{ marginTop: 12 }}>Desk view</div>
                <div><span>Unit cost</span><b>{pkr(selVehicle.totalCost)}</b></div>
                <div><span>Front gross</span><b style={{ color: live.vehicleNet - selVehicle.totalCost < 0 ? "var(--red)" : "var(--jade-dark)" }}>{pkr(live.vehicleNet - selVehicle.totalCost)}</b></div>
                <div><span>Commission</span><b>{pkr(Math.max(0, live.vehicleNet - selVehicle.totalCost) * num(form.commissionRate) / 100)}</b></div>
              </>
            ) : null}
          </aside>
        </div>
      </ModalForm>

      <DealDesk
        id={deskId}
        isAdmin={isAdmin}
        onClose={() => setDeskId(null)}
        onEdit={(d) => {
          setDeskId(null);
          openEdit(d);
        }}
        onChanged={load}
      />
    </>
  );
}

type DeskData = { deal: Deal; vehicle: Vehicle | null; customer: Customer | null; audit: { _id: string; summary: string; actorName?: string; createdAt: string }[] };

function DealDesk({
  id,
  isAdmin,
  onClose,
  onEdit,
  onChanged,
}: {
  id: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (d: Deal) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<DeskData | null>(null);
  const [msg, setMsg] = useState("");
  const [pay, setPay] = useState({ amount: "", method: "cash", reference: "", date: toDateInput(new Date()) });
  const [fin, setFin] = useState({ status: "none", lender: "", downPayment: "0", amount: "0", annualRate: "18", tenureMonths: "36", reference: "" });
  const [showSchedule, setShowSchedule] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api<DeskData>(`/api/dealership/deals/${id}`);
      setData(d);
      const f = d.deal.financing || ({} as Deal["financing"]);
      setFin({
        status: f.status || "none",
        lender: f.lender || "",
        downPayment: String(f.downPayment || 0),
        amount: String(f.amount || Math.max(0, d.deal.totals.payable - d.deal.paid)),
        annualRate: String(f.annualRate || 18),
        tenureMonths: String(f.tenureMonths || 36),
        reference: f.reference || "",
      });
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setShowSchedule(false);
    load();
  }, [load]);

  async function act(body: unknown) {
    try {
      await api(`/api/dealership/deals/${id}`, { method: "POST", json: body });
      await load();
      onChanged();
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    }
  }

  async function receive(e: FormEvent) {
    e.preventDefault();
    if (await act({ action: "payment", payment: { ...pay, amount: Number(pay.amount) } })) {
      setPay({ amount: "", method: "cash", reference: "", date: toDateInput(new Date()) });
    }
  }

  async function saveFinance(e: FormEvent) {
    e.preventDefault();
    await act({
      action: "financing",
      financing: { ...fin, downPayment: num(fin.downPayment), amount: num(fin.amount), annualRate: num(fin.annualRate), tenureMonths: num(fin.tenureMonths) },
    });
  }

  async function cancel() {
    const reason = prompt("Why is this deal being cancelled? Receipts will be reversed as refunds.");
    if (reason) await act({ action: "cancel", reason });
  }

  async function deliver() {
    if (confirm("Deliver the vehicle? This marks it sold, books gross profit and adds any trade-in to stock.")) {
      await act({ action: "deliver" });
    }
  }

  const d = data?.deal;
  const isOpen = d && ["quote", "reserved", "financing"].includes(d.status);
  const finPreview = financeSummary(num(fin.amount), num(fin.annualRate), num(fin.tenureMonths));
  const schedule = useMemo(
    () => (showSchedule ? amortization(num(fin.amount), num(fin.annualRate), num(fin.tenureMonths)) : []),
    [showSchedule, fin.amount, fin.annualRate, fin.tenureMonths]
  );

  return (
    <Sheet
      open={Boolean(id)}
      title={d ? `${d.number}` : "Deal"}
      subtitle={d ? <>{d.customerName} · {d.vehicleLabel} ({d.stockNo}) · <Pill value={d.status} /></> : null}
      onClose={onClose}
      actions={
        d ? (
          <>
            <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>Print</button>
            {isOpen ? <button type="button" className="btn-ghost no-print" onClick={() => onEdit(d)}>Edit desk</button> : null}
          </>
        ) : null
      }
    >
      {msg ? <div className="alert err no-print">{msg}</div> : null}
      {!d ? (
        <EmptyState message="Loading…" />
      ) : (
        <>
          <ol className="dl-stepper no-print">
            {DEAL_STEPS.map((s, i) => {
              const done = Boolean(d.steps?.[s.key]);
              const clickable = isOpen && s.key !== "delivered";
              return (
                <li key={s.key} className={done ? "done" : ""}>
                  <button type="button" disabled={!clickable} onClick={() => act({ action: "step", step: s.key, done: !done })} title={clickable ? "Toggle step" : undefined}>
                    <span className="dot">{done ? "✓" : i + 1}</span>
                    <span>{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="pay-stat-row no-print">
            <Stat label="Customer pays" value={pkr(d.totals.payable)} />
            <Stat label="Received" value={pkr(d.paid)} tone="good" />
            <Stat label="Financed (approved)" value={pkr(d.financing?.status === "approved" ? d.financing.amount : 0)} />
            <Stat label="Balance due" value={pkr(d.totals.balance)} tone={d.totals.balance > 0 ? "warn" : "good"} />
            {d.grossProfit != null ? <Stat label="Gross profit" value={pkr(d.grossProfit)} hint={`Commission ${pkr(d.commission)}`} tone={d.grossProfit < 0 ? "bad" : "good"} /> : null}
          </div>

          {d.status === "cancelled" ? <div className="alert err">Cancelled {prettyDate(d.cancelledAt)} — {d.cancelReason}</div> : null}
          {d.status === "delivered" ? <div className="alert ok">Delivered {prettyDate(d.deliveredAt)}. Unit cost {pkr(d.costOfSale)}.</div> : null}

          <div className="grid-2 no-print">
            <div>
              <div className="form-section-title">Receipts</div>
              {d.payments.length ? (
                <table className="reg">
                  <tbody>
                    {d.payments.map((p) => (
                      <tr key={p._id}>
                        <td>{prettyDate(p.date)}</td>
                        <td>{label(p.method)}{p.reference ? <span className="muted small"> · {p.reference}</span> : null}</td>
                        <td className="num">{pkr(p.amount)}</td>
                        <td className="right">
                          {isAdmin && isOpen ? (
                            <button type="button" className="link-btn danger" onClick={() => confirm("Reverse this receipt?") && act({ action: "remove_payment", paymentId: p._id })}>Reverse</button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted small">No money received yet.</div>
              )}
              {isOpen && d.totals.balance > 0 ? (
                <form className="dl-inline-form" onSubmit={receive}>
                  <input className={inputClass} type="number" min={1} max={d.totals.balance} placeholder={`Amount (max ${d.totals.balance})`} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required />
                  <select className={inputClass} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                    {["cash", "bank", "online", "cheque"].map((m) => <option key={m} value={m}>{label(m)}</option>)}
                  </select>
                  <input className={inputClass} placeholder="Ref / cheque no." value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
                  <input className={inputClass} type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} />
                  <button type="submit" className="btn-dark">Receive</button>
                </form>
              ) : null}
            </div>

            <div>
              <div className="form-section-title">Financing application</div>
              <form className="form-grid" onSubmit={saveFinance}>
                <Field label="Status">
                  <select className={inputClass} value={fin.status} onChange={(e) => setFin({ ...fin, status: e.target.value })} disabled={!isOpen}>
                    {["none", "applied", "approved", "rejected"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </select>
                </Field>
                <Field label="Lender"><input className={inputClass} value={fin.lender} onChange={(e) => setFin({ ...fin, lender: e.target.value })} disabled={!isOpen} /></Field>
                <Field label="Financed amount"><input className={inputClass} type="number" min={0} value={fin.amount} onChange={(e) => setFin({ ...fin, amount: e.target.value })} disabled={!isOpen} /></Field>
                <Field label="Down payment"><input className={inputClass} type="number" min={0} value={fin.downPayment} onChange={(e) => setFin({ ...fin, downPayment: e.target.value })} disabled={!isOpen} /></Field>
                <Field label="Rate % p.a."><input className={inputClass} type="number" step="0.1" min={0} value={fin.annualRate} onChange={(e) => setFin({ ...fin, annualRate: e.target.value })} disabled={!isOpen} /></Field>
                <Field label="Tenure (months)"><input className={inputClass} type="number" min={0} max={120} value={fin.tenureMonths} onChange={(e) => setFin({ ...fin, tenureMonths: e.target.value })} disabled={!isOpen} /></Field>
                <Field label="Approval ref"><input className={inputClass} value={fin.reference} onChange={(e) => setFin({ ...fin, reference: e.target.value })} disabled={!isOpen} /></Field>
                <div className="dl-emi-box">
                  <div className="muted small">Instalment</div>
                  <b>{pkr(finPreview.emi)}</b>
                  <div className="muted small">Interest {pkr(finPreview.totalInterest)}</div>
                </div>
                {isOpen ? <button type="submit" className="btn-dark">Save financing</button> : <div />}
                <button type="button" className="link-btn" onClick={() => setShowSchedule((s) => !s)}>{showSchedule ? "Hide" : "Show"} repayment schedule</button>
              </form>
              {showSchedule && schedule.length ? (
                <div className="table-scroll dl-schedule">
                  <table className="reg">
                    <thead><tr><th>#</th><th className="right">Instalment</th><th className="right">Interest</th><th className="right">Principal</th><th className="right">Balance</th></tr></thead>
                    <tbody>
                      {schedule.map((r) => (
                        <tr key={r.month}><td>{r.month}</td><td className="num">{pkr(r.emi)}</td><td className="num">{pkr(r.interest)}</td><td className="num">{pkr(r.principal)}</td><td className="num">{pkr(r.balance)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>

          {/* Printable sale agreement / buyer's order */}
          <div className="dl-agreement">
            <h3>Buyer&apos;s order — {d.number}</h3>
            <div className="grid-2">
              <div>
                <div className="form-section-title">Buyer</div>
                <div><b>{d.customerName}</b></div>
                <div className="small">{data.customer?.phone || ""} {data.customer?.cnic ? `· CNIC ${data.customer.cnic}` : ""}</div>
                <div className="small">{data.customer?.address || ""} {data.customer?.city || ""}</div>
              </div>
              <div>
                <div className="form-section-title">Vehicle</div>
                <div><b>{d.vehicleLabel}</b></div>
                <div className="small">Stock {d.stockNo}{data.vehicle?.vin ? ` · VIN ${data.vehicle.vin}` : ""}{data.vehicle?.registrationNo ? ` · Reg ${data.vehicle.registrationNo}` : ""}</div>
                <div className="small">{data.vehicle ? `${data.vehicle.mileage.toLocaleString()} km · ${data.vehicle.color || ""}` : ""}</div>
              </div>
            </div>
            <div className="dl-summary flat">
              <div><span>Sale price</span><b>{pkr(d.salePrice)}</b></div>
              {d.discount ? <div><span>Discount</span><b>− {pkr(d.discount)}</b></div> : null}
              {d.taxAmount ? <div><span>Tax / duties</span><b>{pkr(d.taxAmount)}</b></div> : null}
              {d.registrationFee ? <div><span>Registration / transfer</span><b>{pkr(d.registrationFee)}</b></div> : null}
              {d.otherFees ? <div><span>Other fees</span><b>{pkr(d.otherFees)}</b></div> : null}
              {d.tradeInAllowance ? <div><span>Trade-in {d.tradeIn?.make ? `(${d.tradeIn.year || ""} ${d.tradeIn.make} ${d.tradeIn.model || ""})` : ""}</span><b>− {pkr(d.totals.netTradeIn)}</b></div> : null}
              <div className="total"><span>Total payable</span><b>{pkr(d.totals.payable)}</b></div>
              <div><span>Received to date</span><b>{pkr(d.paid)}</b></div>
              {d.financing?.amount ? (
                <div><span>Financed by {d.financing.lender || "bank"} ({label(d.financing.status)}) — {d.financing.tenureMonths} × {pkr(d.financing.monthlyInstallment)}</span><b>{pkr(d.financing.amount)}</b></div>
              ) : null}
              <div className="total"><span>Balance</span><b>{pkr(d.totals.balance)}</b></div>
            </div>
            <div className="voucher-signatures">
              <span>Buyer signature</span>
              <span>Salesperson — {d.salesperson || ""}</span>
              <span>Sales manager</span>
            </div>
          </div>

          {data.audit.length ? (
            <details className="no-print" style={{ marginTop: 12 }}>
              <summary className="muted small">Audit trail ({data.audit.length})</summary>
              <ul className="dl-list">
                {data.audit.map((a) => <li key={a._id} className="small">{prettyDate(a.createdAt)} · {a.actorName || "—"} · {a.summary}</li>)}
              </ul>
            </details>
          ) : null}

          {isOpen ? (
            <div className="dl-footer-actions no-print">
              {d.status === "quote" ? <button type="button" className="btn-ghost" onClick={() => act({ action: "reserve" })}>Reserve vehicle</button> : null}
              <button type="button" className="btn-primary" onClick={deliver}>Deliver & close sale</button>
              <button type="button" className="link-btn danger" onClick={cancel}>Cancel deal</button>
            </div>
          ) : null}
        </>
      )}
    </Sheet>
  );
}
