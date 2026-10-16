"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, ModalForm, Panel, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";
import { ACTIVITY_TYPES, LEAD_SOURCES, LEAD_STAGES, LEAD_STAGE_LABEL, type LeadStage } from "@/lib/dealership";
import { Branch, Customer, Deal, Pill, Sheet, Vehicle, api, label, pkr, withBranch } from "./shared";

type CustomerForm = {
  name: string;
  phone: string;
  email: string;
  cnic: string;
  city: string;
  address: string;
  source: string;
  stage: LeadStage;
  lostReason: string;
  branchCode: string;
  assignedTo: string;
  interestedVehicleId: string;
  interestNotes: string;
  budgetMin: string;
  budgetMax: string;
  wantsFinancing: boolean;
  nextFollowUp: string;
  hasTradeIn: boolean;
  tMake: string;
  tModel: string;
  tYear: string;
  tMileage: string;
  tReg: string;
  tCondition: string;
  tExpected: string;
  tOffered: string;
  tPayoff: string;
};

function emptyForm(branch: string): CustomerForm {
  return {
    name: "",
    phone: "",
    email: "",
    cnic: "",
    city: "",
    address: "",
    source: "walk_in",
    stage: "new",
    lostReason: "",
    branchCode: branch,
    assignedTo: "",
    interestedVehicleId: "",
    interestNotes: "",
    budgetMin: "",
    budgetMax: "",
    wantsFinancing: false,
    nextFollowUp: toDateInput(new Date(Date.now() + 86_400_000)),
    hasTradeIn: false,
    tMake: "",
    tModel: "",
    tYear: "",
    tMileage: "",
    tReg: "",
    tCondition: "",
    tExpected: "",
    tOffered: "",
    tPayoff: "",
  };
}

function toForm(c: Customer): CustomerForm {
  const t = c.tradeIn || {};
  const s = (n?: number) => (n || n === 0 ? String(n) : "");
  return {
    name: c.name,
    phone: c.phone || "",
    email: c.email || "",
    cnic: c.cnic || "",
    city: c.city || "",
    address: c.address || "",
    source: c.source,
    stage: c.stage,
    lostReason: c.lostReason || "",
    branchCode: c.branchCode,
    assignedTo: c.assignedTo || "",
    interestedVehicleId: c.interestedVehicleId?._id || "",
    interestNotes: c.interestNotes || "",
    budgetMin: s(c.budgetMin),
    budgetMax: s(c.budgetMax),
    wantsFinancing: c.wantsFinancing,
    nextFollowUp: toDateInput(c.nextFollowUp),
    hasTradeIn: Boolean(t.make),
    tMake: t.make || "",
    tModel: t.model || "",
    tYear: s(t.year),
    tMileage: s(t.mileage),
    tReg: t.registrationNo || "",
    tCondition: t.condition || "",
    tExpected: s(t.expectedValue),
    tOffered: s(t.offeredValue),
    tPayoff: s(t.payoff),
  };
}

function fromForm(f: CustomerForm) {
  const n = (v: string) => (v === "" ? undefined : Number(v));
  return {
    name: f.name,
    phone: f.phone,
    email: f.email,
    cnic: f.cnic,
    city: f.city,
    address: f.address,
    source: f.source,
    stage: f.stage,
    lostReason: f.lostReason,
    branchCode: f.branchCode,
    assignedTo: f.assignedTo,
    interestedVehicleId: f.interestedVehicleId,
    interestNotes: f.interestNotes,
    budgetMin: n(f.budgetMin),
    budgetMax: n(f.budgetMax),
    wantsFinancing: f.wantsFinancing,
    nextFollowUp: f.nextFollowUp,
    tradeIn: f.hasTradeIn
      ? {
          make: f.tMake,
          model: f.tModel,
          year: n(f.tYear),
          mileage: n(f.tMileage),
          registrationNo: f.tReg,
          condition: f.tCondition,
          expectedValue: n(f.tExpected),
          offeredValue: n(f.tOffered),
          payoff: n(f.tPayoff),
        }
      : {},
  };
}

const ACTIVITY_ICON: Record<string, string> = {
  note: "📝",
  call: "📞",
  whatsapp: "💬",
  visit: "🏢",
  test_drive: "🚗",
  offer: "💰",
  email: "✉️",
  system: "⚙️",
};

export function DealershipCustomers({
  branch,
  branches,
  isAdmin,
  openId,
  onOpenHandled,
  onStartDeal,
}: {
  branch: string;
  branches: Branch[];
  isAdmin: boolean;
  openId: string | null;
  onOpenHandled: () => void;
  onStartDeal: (customerId: string, vehicleId?: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState("");
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm(branch));
  const [formError, setFormError] = useState("");
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([
        api<{ customers: Customer[] }>(withBranch("/api/dealership/customers", branch)),
        api<{ vehicles: Vehicle[] }>(withBranch("/api/dealership/vehicles", branch)),
      ]);
      setCustomers(c.customers);
      setVehicles(v.vehicles.filter((x) => x.status !== "sold"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [branch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    if (openId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileId(openId);
      onOpenHandled();
    }
  }, [openId, onOpenHandled]);

  const owners = useMemo(() => [...new Set(customers.map((c) => c.assignedTo).filter(Boolean))] as string[], [customers]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (owner && c.assignedTo !== owner) return false;
      if (!term) return true;
      return [c.name, c.phone, c.email, c.city, c.cnic].some((x) => x?.toLowerCase().includes(term));
    });
  }, [customers, q, owner]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm(branch || branches[0]?.code || ""));
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm(toForm(c));
    setFormError("");
    setFormOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api(editing ? `/api/dealership/customers/${editing._id}` : "/api/dealership/customers", {
        method: editing ? "PUT" : "POST",
        json: fromForm(form),
      });
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  async function moveStage(c: Customer, stage: LeadStage) {
    if (stage === c.stage) return;
    if (stage === "lost") {
      openEdit({ ...c, stage: "lost" });
      return;
    }
    try {
      await api(`/api/dealership/customers/${c._id}`, {
        method: "POST",
        json: { type: "note", text: `Moved to ${LEAD_STAGE_LABEL[stage]}`, stage },
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const set = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const today = new Date(new Date().toDateString());

  return (
    <>
      <div className="accounting-toolbar no-print dl-toolbar">
        <input className={inputClass} placeholder="Search name, phone, CNIC, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">All salespeople</option>
          {owners.map((o) => <option key={o}>{o}</option>)}
        </select>
        <div className="chips">
          <button type="button" className={`filter-chip${view === "board" ? " active" : ""}`} onClick={() => setView("board")}>Pipeline</button>
          <button type="button" className={`filter-chip${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>List</button>
        </div>
        <button type="button" className="btn-primary" onClick={openNew}>+ New lead</button>
      </div>
      {error ? <div className="alert err">{error}</div> : null}

      {view === "board" ? (
        <div className="dl-board">
          {LEAD_STAGES.map((stage) => {
            const col = shown.filter((c) => c.stage === stage).sort((a, b) => b.score - a.score);
            return (
              <div
                className="dl-col"
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const c = customers.find((x) => x._id === e.dataTransfer.getData("text/plain"));
                  if (c) moveStage(c, stage);
                }}
              >
                <div className="dl-col-head">
                  <span>{LEAD_STAGE_LABEL[stage]}</span>
                  <span className="muted small">{col.length}</span>
                </div>
                {col.map((c) => {
                  const due = c.nextFollowUp && new Date(c.nextFollowUp) < today && !["won", "lost"].includes(c.stage);
                  return (
                    <div
                      key={c._id}
                      className="dl-lead"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", c._id)}
                      onClick={() => setProfileId(c._id)}
                    >
                      <div className="dl-lead-top">
                        <b>{c.name}</b>
                        <span className={`dl-score s${Math.min(3, Math.floor(c.score / 30))}`}>{c.score}</span>
                      </div>
                      <div className="muted small">{c.phone || c.email || "No contact"}</div>
                      {c.interestedVehicleId ? (
                        <div className="small">🚗 {c.interestedVehicleId.year} {c.interestedVehicleId.make} {c.interestedVehicleId.model}</div>
                      ) : null}
                      <div className="dl-lead-foot">
                        <span className="muted small">{c.assignedTo || "Unassigned"}</span>
                        {c.nextFollowUp && !["won", "lost"].includes(c.stage) ? (
                          <span className="small" style={{ color: due ? "var(--red)" : undefined }}>⏰ {prettyDate(c.nextFollowUp)}</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <Panel>
          {shown.length ? (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Stage</th>
                    <th>Source</th>
                    <th>Interest</th>
                    <th>Owner</th>
                    <th>Follow-up</th>
                    <th className="right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c._id} onClick={() => setProfileId(c._id)} style={{ cursor: "pointer" }}>
                      <td><b>{c.name}</b><div className="muted small">{c.phone || "—"} · {c.branchCode}</div></td>
                      <td><Pill value={c.stage} /></td>
                      <td>{label(c.source)}</td>
                      <td>{c.interestedVehicleId ? `${c.interestedVehicleId.make} ${c.interestedVehicleId.model}` : c.interestNotes || "—"}</td>
                      <td>{c.assignedTo || "—"}</td>
                      <td>{prettyDate(c.nextFollowUp)}</td>
                      <td className="num">{c.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="No customers yet." />
          )}
        </Panel>
      )}

      <ModalForm
        open={formOpen}
        wide
        title={editing ? `Edit ${editing.name}` : "New lead"}
        onClose={() => setFormOpen(false)}
        onSubmit={save}
        submitLabel={editing ? "Save" : "Create lead"}
      >
        {formError ? <div className="alert err">{formError}</div> : null}
        <div className="form-section-title">Contact</div>
        <div className="form-grid three">
          <Field label="Full name" required><input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="03xx-xxxxxxx" /></Field>
          <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="CNIC"><input className={inputClass} value={form.cnic} onChange={(e) => set("cnic", e.target.value)} placeholder="xxxxx-xxxxxxx-x" /></Field>
          <Field label="City"><input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Address"><input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </div>
        <div className="form-section-title">Opportunity</div>
        <div className="form-grid three">
          <Field label="Source">
            <select className={inputClass} value={form.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select className={inputClass} value={form.stage} onChange={(e) => set("stage", e.target.value as LeadStage)}>
              {LEAD_STAGES.map((s) => <option key={s} value={s}>{LEAD_STAGE_LABEL[s]}</option>)}
            </select>
          </Field>
          {form.stage === "lost" ? (
            <Field label="Lost reason" required><input className={inputClass} value={form.lostReason} onChange={(e) => set("lostReason", e.target.value)} required placeholder="Bought elsewhere, price, finance declined…" /></Field>
          ) : (
            <Field label="Next follow-up"><input className={inputClass} type="date" value={form.nextFollowUp} onChange={(e) => set("nextFollowUp", e.target.value)} /></Field>
          )}
          <Field label="Branch">
            <select className={inputClass} value={form.branchCode} onChange={(e) => set("branchCode", e.target.value)}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
          <Field label="Salesperson"><input className={inputClass} value={form.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} list="dl-owners" /></Field>
          <Field label="Vehicle of interest">
            <select className={inputClass} value={form.interestedVehicleId} onChange={(e) => set("interestedVehicleId", e.target.value)}>
              <option value="">— none —</option>
              {vehicles.map((v) => <option key={v._id} value={v._id}>{v.stockNo} · {v.label} · {pkr(v.listPrice)}</option>)}
            </select>
          </Field>
          <Field label="Budget from"><input className={inputClass} type="number" min={0} value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} /></Field>
          <Field label="Budget to"><input className={inputClass} type="number" min={0} value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} /></Field>
          <Field label="Looking for"><input className={inputClass} value={form.interestNotes} onChange={(e) => set("interestNotes", e.target.value)} placeholder="Family SUV, auto, under 60k km" /></Field>
        </div>
        <datalist id="dl-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
        <label className="check-row">
          <input type="checkbox" checked={form.wantsFinancing} onChange={(e) => set("wantsFinancing", e.target.checked)} /> Wants bank / lease financing
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.hasTradeIn} onChange={(e) => set("hasTradeIn", e.target.checked)} /> Has a trade-in vehicle
        </label>
        {form.hasTradeIn ? (
          <div className="form-grid three">
            <Field label="Trade-in make"><input className={inputClass} value={form.tMake} onChange={(e) => set("tMake", e.target.value)} required /></Field>
            <Field label="Model"><input className={inputClass} value={form.tModel} onChange={(e) => set("tModel", e.target.value)} /></Field>
            <Field label="Year"><input className={inputClass} type="number" value={form.tYear} onChange={(e) => set("tYear", e.target.value)} /></Field>
            <Field label="Mileage (km)"><input className={inputClass} type="number" value={form.tMileage} onChange={(e) => set("tMileage", e.target.value)} /></Field>
            <Field label="Registration"><input className={inputClass} value={form.tReg} onChange={(e) => set("tReg", e.target.value)} /></Field>
            <Field label="Condition"><input className={inputClass} value={form.tCondition} onChange={(e) => set("tCondition", e.target.value)} placeholder="Good, minor dents" /></Field>
            <Field label="Customer expects"><input className={inputClass} type="number" value={form.tExpected} onChange={(e) => set("tExpected", e.target.value)} /></Field>
            <Field label="Our valuation"><input className={inputClass} type="number" value={form.tOffered} onChange={(e) => set("tOffered", e.target.value)} /></Field>
            <Field label="Outstanding loan payoff"><input className={inputClass} type="number" value={form.tPayoff} onChange={(e) => set("tPayoff", e.target.value)} /></Field>
          </div>
        ) : null}
      </ModalForm>

      <CustomerProfile
        id={profileId}
        isAdmin={isAdmin}
        onClose={() => setProfileId(null)}
        onEdit={(c) => {
          setProfileId(null);
          openEdit(c);
        }}
        onChanged={load}
        onStartDeal={(cid, vid) => {
          setProfileId(null);
          onStartDeal(cid, vid);
        }}
      />
    </>
  );
}

function CustomerProfile({
  id,
  isAdmin,
  onClose,
  onEdit,
  onChanged,
  onStartDeal,
}: {
  id: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onChanged: () => void;
  onStartDeal: (customerId: string, vehicleId?: string) => void;
}) {
  const [data, setData] = useState<{ customer: Customer; deals: Deal[] } | null>(null);
  const [entry, setEntry] = useState({ type: "call", text: "", nextFollowUp: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api(`/api/dealership/customers/${id}`));
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    load();
  }, [load]);

  async function log(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/api/dealership/customers/${id}`, { method: "POST", json: entry });
      setEntry({ type: "call", text: "", nextFollowUp: "" });
      await load();
      onChanged();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function remove() {
    if (!confirm("Delete this customer permanently?")) return;
    try {
      await api(`/api/dealership/customers/${id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  const c = data?.customer;
  const t = c?.tradeIn;
  const open = c && !["won", "lost"].includes(c.stage);

  return (
    <Sheet
      open={Boolean(id)}
      title={c?.name || "Customer"}
      subtitle={c ? <>{c.phone || "—"} · {c.branchCode} · <Pill value={c.stage} /> · score {c.score}</> : null}
      onClose={onClose}
      actions={
        c ? (
          <>
            {c.stage !== "lost" ? (
              <button type="button" className="btn-primary" onClick={() => onStartDeal(c._id, c.interestedVehicleId?._id)}>New deal</button>
            ) : null}
            <button type="button" className="btn-ghost" onClick={() => onEdit(c)}>Edit</button>
          </>
        ) : null
      }
    >
      {msg ? <div className="alert err">{msg}</div> : null}
      {!c ? (
        <EmptyState message="Loading…" />
      ) : (
        <div className="dl-detail">
          <div>
            <dl className="dl-specs">
              <dt>Email</dt><dd>{c.email || "—"}</dd>
              <dt>CNIC</dt><dd>{c.cnic || "—"}</dd>
              <dt>City</dt><dd>{c.city || "—"}</dd>
              <dt>Source</dt><dd>{label(c.source)}</dd>
              <dt>Salesperson</dt><dd>{c.assignedTo || "—"}</dd>
              <dt>Budget</dt><dd>{c.budgetMin || c.budgetMax ? `${pkr(c.budgetMin)} – ${pkr(c.budgetMax)}` : "—"}</dd>
              <dt>Financing</dt><dd>{c.wantsFinancing ? "Wants financing" : "Cash buyer"}</dd>
              <dt>Follow-up</dt><dd>{prettyDate(c.nextFollowUp)}</dd>
              {c.stage === "lost" ? (<><dt>Lost reason</dt><dd>{c.lostReason}</dd></>) : null}
            </dl>
            {c.interestedVehicleId ? (
              <div className="dl-callout">
                <div className="muted small">Vehicle of interest</div>
                <b>{c.interestedVehicleId.year} {c.interestedVehicleId.make} {c.interestedVehicleId.model} {c.interestedVehicleId.variant || ""}</b>
                <div className="small">{c.interestedVehicleId.stockNo} · {pkr(c.interestedVehicleId.listPrice)} · <Pill value={c.interestedVehicleId.status} /></div>
              </div>
            ) : c.interestNotes ? (
              <div className="dl-callout"><div className="muted small">Looking for</div>{c.interestNotes}</div>
            ) : null}
            {t?.make ? (
              <div className="dl-callout">
                <div className="muted small">Trade-in</div>
                <b>{t.year} {t.make} {t.model}</b> <span className="small">{t.mileage ? `${t.mileage.toLocaleString()} km` : ""} {t.registrationNo || ""}</span>
                <div className="small">Expects {pkr(t.expectedValue)} · Our valuation {pkr(t.offeredValue)}{t.payoff ? ` · Payoff ${pkr(t.payoff)}` : ""}</div>
                {t.expectedValue && t.offeredValue ? (
                  <div className="small" style={{ color: t.expectedValue > t.offeredValue ? "#96650f" : "var(--jade-dark)" }}>
                    Gap {pkr(t.expectedValue - t.offeredValue)}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="form-section-title">Deals</div>
            {data.deals.length ? (
              <table className="reg">
                <tbody>
                  {data.deals.map((d) => (
                    <tr key={d._id}>
                      <td><b>{d.number}</b><div className="muted small">{d.vehicleLabel}</div></td>
                      <td><Pill value={d.status} /></td>
                      <td className="num">{pkr(d.totals.payable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="muted small">No deals yet.</div>
            )}
            {isAdmin && !data.deals.length ? (
              <button type="button" className="link-btn danger" style={{ marginTop: 12 }} onClick={remove}>Delete customer</button>
            ) : null}
          </div>
          <div>
            <div className="form-section-title">Log activity</div>
            <form onSubmit={log} className="dl-activity-form">
              <select className={inputClass} value={entry.type} onChange={(e) => setEntry({ ...entry, type: e.target.value })}>
                {ACTIVITY_TYPES.filter((a) => a !== "system").map((a) => <option key={a} value={a}>{ACTIVITY_ICON[a]} {label(a)}</option>)}
              </select>
              <textarea className={inputClass} rows={2} placeholder="What happened? e.g. Offered 500k over trade-in valuation" value={entry.text} onChange={(e) => setEntry({ ...entry, text: e.target.value })} required />
              {open ? (
                <label className="small muted">
                  Next follow-up <input className={inputClass} type="date" value={entry.nextFollowUp} onChange={(e) => setEntry({ ...entry, nextFollowUp: e.target.value })} />
                </label>
              ) : null}
              <button type="submit" className="btn-dark">Add to timeline</button>
            </form>
            <div className="form-section-title" style={{ marginTop: 14 }}>History</div>
            <ol className="dl-timeline">
              {[...c.activities].reverse().map((a) => (
                <li key={a._id}>
                  <span className="dl-tl-icon">{ACTIVITY_ICON[a.type] || "•"}</span>
                  <div>
                    <div>{a.text}</div>
                    <div className="muted small">{prettyDate(a.at)} {new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {a.byName || "—"}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Sheet>
  );
}
