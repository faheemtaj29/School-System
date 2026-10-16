"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Field, ModalForm, Panel, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";
import { VEHICLE_STATUSES } from "@/lib/dealership";
import { Branch, Deal, Pill, Sheet, Vehicle, api, label, pkr, withBranch } from "./shared";

const BODY_TYPES = ["Sedan", "Hatchback", "SUV", "Crossover", "Pickup", "Van", "Coupe", "MPV"];
const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric", "CNG"];
const TRANSMISSIONS = ["Automatic", "Manual"];

type VehicleForm = {
  stockNo: string;
  vin: string;
  registrationNo: string;
  make: string;
  model: string;
  variant: string;
  year: string;
  bodyType: string;
  fuel: string;
  transmission: string;
  color: string;
  engineCc: string;
  mileage: string;
  condition: "new" | "used" | "certified";
  status: string;
  branchCode: string;
  purchaseCost: string;
  listPrice: string;
  floorPrice: string;
  photos: string;
  features: string;
  acquiredFrom: string;
  acquiredAt: string;
  notes: string;
};

function emptyForm(branch: string): VehicleForm {
  return {
    stockNo: "",
    vin: "",
    registrationNo: "",
    make: "",
    model: "",
    variant: "",
    year: String(new Date().getFullYear()),
    bodyType: "",
    fuel: "Petrol",
    transmission: "Automatic",
    color: "",
    engineCc: "",
    mileage: "0",
    condition: "used",
    status: "in_stock",
    branchCode: branch,
    purchaseCost: "",
    listPrice: "",
    floorPrice: "",
    photos: "",
    features: "",
    acquiredFrom: "",
    acquiredAt: toDateInput(new Date()),
    notes: "",
  };
}

function toForm(v: Vehicle): VehicleForm {
  return {
    stockNo: v.stockNo,
    vin: v.vin || "",
    registrationNo: v.registrationNo || "",
    make: v.make,
    model: v.model,
    variant: v.variant || "",
    year: String(v.year),
    bodyType: v.bodyType || "",
    fuel: v.fuel || "",
    transmission: v.transmission || "",
    color: v.color || "",
    engineCc: v.engineCc ? String(v.engineCc) : "",
    mileage: String(v.mileage || 0),
    condition: v.condition,
    status: v.status,
    branchCode: v.branchCode,
    purchaseCost: String(v.purchaseCost || ""),
    listPrice: String(v.listPrice || ""),
    floorPrice: String(v.floorPrice || ""),
    photos: (v.photos || []).join("\n"),
    features: (v.features || []).join(", "),
    acquiredFrom: v.acquiredFrom || "",
    acquiredAt: toDateInput(v.acquiredAt),
    notes: v.notes || "",
  };
}

function fromForm(f: VehicleForm) {
  return {
    ...f,
    engineCc: f.engineCc ? Number(f.engineCc) : undefined,
    year: Number(f.year),
    mileage: Number(f.mileage || 0),
    purchaseCost: Number(f.purchaseCost || 0),
    listPrice: Number(f.listPrice || 0),
    floorPrice: Number(f.floorPrice || 0),
    photos: f.photos.split(/\s+/).map((s) => s.trim()).filter(Boolean),
    features: f.features.split(",").map((s) => s.trim()).filter(Boolean),
    stockNo: f.stockNo || undefined,
    vin: f.vin || undefined,
  };
}

type Sort = "newest" | "price_asc" | "price_desc" | "days_desc" | "gross_desc";

export function DealershipInventory({
  branch,
  branches,
  isAdmin,
  onStartDeal,
}: {
  branch: string;
  branches: Branch[];
  isAdmin: boolean;
  onStartDeal: (vehicleId: string) => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("unsold");
  const [make, setMake] = useState("");
  const [body, setBody] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleForm>(emptyForm(branch));
  const [formError, setFormError] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<{ vehicles: Vehicle[] }>(withBranch("/api/dealership/vehicles", branch));
      setVehicles(d.vehicles);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [branch]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const makes = useMemo(() => [...new Set(vehicles.map((v) => v.make))].sort(), [vehicles]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = vehicles.filter((v) => {
      if (status === "unsold" ? v.status === "sold" : status && v.status !== status) return false;
      if (make && v.make !== make) return false;
      if (body && v.bodyType !== body) return false;
      if (maxPrice && v.listPrice > Number(maxPrice)) return false;
      if (!term) return true;
      return [v.stockNo, v.vin, v.registrationNo, v.label, v.color].some((x) => x?.toLowerCase().includes(term));
    });
    const by: Record<Sort, (a: Vehicle, b: Vehicle) => number> = {
      newest: (a, b) => +new Date(b.acquiredAt) - +new Date(a.acquiredAt),
      price_asc: (a, b) => a.listPrice - b.listPrice,
      price_desc: (a, b) => b.listPrice - a.listPrice,
      days_desc: (a, b) => b.daysInStock - a.daysInStock,
      gross_desc: (a, b) => b.potentialGross - a.potentialGross,
    };
    return rows.sort(by[sort]);
  }, [vehicles, q, status, make, body, maxPrice, sort]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm(branch || branches[0]?.code || ""));
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(v: Vehicle) {
    setEditing(v);
    setForm(toForm(v));
    setFormError("");
    setFormOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api(editing ? `/api/dealership/vehicles/${editing._id}` : "/api/dealership/vehicles", {
        method: editing ? "PUT" : "POST",
        json: fromForm(form),
      });
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    }
  }

  const set = <K extends keyof VehicleForm>(key: K, value: VehicleForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const margin = Number(form.listPrice || 0) - Number(form.purchaseCost || 0) - (editing?.reconTotal || 0);

  return (
    <>
      <div className="accounting-toolbar no-print dl-toolbar">
        <input className={inputClass} placeholder="Search stock no, VIN, reg, make, model…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="unsold">All unsold</option>
          <option value="">Everything</option>
          {VEHICLE_STATUSES.map((s) => (
            <option key={s} value={s}>{label(s)}</option>
          ))}
        </select>
        <select className={inputClass} value={make} onChange={(e) => setMake(e.target.value)}>
          <option value="">All makes</option>
          {makes.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select className={inputClass} value={body} onChange={(e) => setBody(e.target.value)}>
          <option value="">All body types</option>
          {BODY_TYPES.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
        <input className={inputClass} type="number" min={0} placeholder="Max price" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
        <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest arrivals</option>
          <option value="price_asc">Price: low → high</option>
          <option value="price_desc">Price: high → low</option>
          <option value="days_desc">Oldest stock first</option>
          <option value="gross_desc">Highest margin</option>
        </select>
        <div className="chips">
          <button type="button" className={`filter-chip${view === "grid" ? " active" : ""}`} onClick={() => setView("grid")}>Cards</button>
          <button type="button" className={`filter-chip${view === "table" ? " active" : ""}`} onClick={() => setView("table")}>Table</button>
        </div>
        <button type="button" className="btn-primary" onClick={openNew}>+ Add vehicle</button>
      </div>

      {error ? <div className="alert err">{error}</div> : null}

      {loading && !vehicles.length ? (
        <EmptyState message="Loading inventory…" />
      ) : !shown.length ? (
        <EmptyState message={vehicles.length ? "No vehicles match these filters." : "No vehicles yet. Add your first unit."} />
      ) : view === "grid" ? (
        <div className="dl-grid">
          {shown.map((v) => (
            <button type="button" key={v._id} className="dl-card" onClick={() => setDetailId(v._id)}>
              <div className="dl-card-photo" style={v.photos[0] ? { backgroundImage: `url("${v.photos[0]}")` } : undefined}>
                {!v.photos[0] ? <span>{v.make}</span> : null}
                <div className="dl-card-badges">
                  <Pill value={v.status} />
                  {v.daysInStock > 60 && v.status !== "sold" ? (
                    <span className={`badge ${v.daysInStock > 90 ? "absent" : "leave"}`}>{v.daysInStock}d</span>
                  ) : null}
                </div>
              </div>
              <div className="dl-card-body">
                <div className="dl-card-title">{v.label}</div>
                <div className="muted small">
                  {v.stockNo} · {v.mileage.toLocaleString()} km · {v.transmission || "—"} · {v.fuel || "—"}
                </div>
                <div className="dl-card-foot">
                  <span className="dl-price">{pkr(v.listPrice)}</span>
                  <span className="muted small">{v.branchCode}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Panel>
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Branch</th>
                  <th className="right">Km</th>
                  <th className="right">Days</th>
                  <th className="right">Cost</th>
                  <th className="right">List</th>
                  <th className="right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v._id} onClick={() => setDetailId(v._id)} style={{ cursor: "pointer" }}>
                    <td><b>{v.stockNo}</b></td>
                    <td>
                      {v.label}
                      <div className="muted small">{v.vin || v.registrationNo || "—"}</div>
                    </td>
                    <td><Pill value={v.status} /></td>
                    <td>{v.branchCode}</td>
                    <td className="num">{v.mileage.toLocaleString()}</td>
                    <td className="num" style={{ color: v.daysInStock > 90 ? "var(--red)" : undefined }}>{v.daysInStock}</td>
                    <td className="num">{pkr(v.totalCost)}</td>
                    <td className="num">{pkr(v.listPrice)}</td>
                    <td className="num" style={{ color: v.potentialGross < 0 ? "var(--red)" : "var(--jade-dark)" }}>{pkr(v.potentialGross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <ModalForm
        open={formOpen}
        wide
        title={editing ? `Edit ${editing.stockNo}` : "Add vehicle to stock"}
        subtitle="Cost is posted to accounting as inventory automatically"
        onClose={() => setFormOpen(false)}
        onSubmit={save}
        submitLabel={editing ? "Save changes" : "Add vehicle"}
      >
        {formError ? <div className="alert err">{formError}</div> : null}
        <div className="form-section-title">Identity</div>
        <div className="form-grid three">
          <Field label="Make" required><input className={inputClass} value={form.make} onChange={(e) => set("make", e.target.value)} required placeholder="Toyota" /></Field>
          <Field label="Model" required><input className={inputClass} value={form.model} onChange={(e) => set("model", e.target.value)} required placeholder="Corolla" /></Field>
          <Field label="Variant / trim"><input className={inputClass} value={form.variant} onChange={(e) => set("variant", e.target.value)} placeholder="Altis Grande 1.8" /></Field>
          <Field label="Model year" required><input className={inputClass} type="number" value={form.year} onChange={(e) => set("year", e.target.value)} required /></Field>
          <Field label="VIN / chassis (17)"><input className={inputClass} value={form.vin} maxLength={17} onChange={(e) => set("vin", e.target.value.toUpperCase())} /></Field>
          <Field label="Registration no."><input className={inputClass} value={form.registrationNo} onChange={(e) => set("registrationNo", e.target.value.toUpperCase())} placeholder="LEA-22-1234" /></Field>
          <Field label="Stock no."><input className={inputClass} value={form.stockNo} onChange={(e) => set("stockNo", e.target.value)} placeholder="Auto-generated" /></Field>
          <Field label="Condition">
            <select className={inputClass} value={form.condition} onChange={(e) => set("condition", e.target.value as VehicleForm["condition"])}>
              <option value="new">New</option>
              <option value="used">Used</option>
              <option value="certified">Certified pre-owned</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value)} disabled={editing?.status === "reserved"}>
              {VEHICLE_STATUSES.filter((s) => s !== "sold" && (s !== "reserved" || editing?.status === "reserved")).map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-section-title">Specs</div>
        <div className="form-grid three">
          <Field label="Body type">
            <select className={inputClass} value={form.bodyType} onChange={(e) => set("bodyType", e.target.value)}>
              <option value="">—</option>
              {BODY_TYPES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Fuel">
            <select className={inputClass} value={form.fuel} onChange={(e) => set("fuel", e.target.value)}>
              {FUELS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Transmission">
            <select className={inputClass} value={form.transmission} onChange={(e) => set("transmission", e.target.value)}>
              {TRANSMISSIONS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Mileage (km)"><input className={inputClass} type="number" min={0} value={form.mileage} onChange={(e) => set("mileage", e.target.value)} /></Field>
          <Field label="Engine (cc)"><input className={inputClass} type="number" min={0} value={form.engineCc} onChange={(e) => set("engineCc", e.target.value)} /></Field>
          <Field label="Colour"><input className={inputClass} value={form.color} onChange={(e) => set("color", e.target.value)} /></Field>
        </div>
        <div className="form-section-title">Pricing & acquisition</div>
        <div className="form-grid three">
          <Field label="Purchase cost"><input className={inputClass} type="number" min={0} value={form.purchaseCost} onChange={(e) => set("purchaseCost", e.target.value)} /></Field>
          <Field label="List price"><input className={inputClass} type="number" min={0} value={form.listPrice} onChange={(e) => set("listPrice", e.target.value)} /></Field>
          <Field label="Floor price (manager)"><input className={inputClass} type="number" min={0} value={form.floorPrice} onChange={(e) => set("floorPrice", e.target.value)} /></Field>
          <Field label="Branch">
            <select className={inputClass} value={form.branchCode} onChange={(e) => set("branchCode", e.target.value)}>
              {branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}
            </select>
          </Field>
          <Field label="Acquired from"><input className={inputClass} value={form.acquiredFrom} onChange={(e) => set("acquiredFrom", e.target.value)} placeholder="Auction, private seller…" /></Field>
          <Field label="Acquired on"><input className={inputClass} type="date" value={form.acquiredAt} onChange={(e) => set("acquiredAt", e.target.value)} /></Field>
        </div>
        <div className="muted small" style={{ marginBottom: 10 }}>
          Front-end margin at list: <b style={{ color: margin < 0 ? "var(--red)" : "var(--jade-dark)" }}>{pkr(margin)}</b>
        </div>
        <div className="form-grid">
          <Field label="Photo URLs (one per line)"><textarea className={inputClass} rows={3} value={form.photos} onChange={(e) => set("photos", e.target.value)} /></Field>
          <Field label="Features (comma separated)"><textarea className={inputClass} rows={3} value={form.features} onChange={(e) => set("features", e.target.value)} placeholder="Sunroof, Push start, Cruise control" /></Field>
        </div>
        <Field label="Notes"><textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </ModalForm>

      <VehicleDetail
        id={detailId}
        branches={branches}
        isAdmin={isAdmin}
        onClose={() => setDetailId(null)}
        onEdit={(v) => {
          setDetailId(null);
          openEdit(v);
        }}
        onChanged={load}
        onStartDeal={(vid) => {
          setDetailId(null);
          onStartDeal(vid);
        }}
      />
    </>
  );
}

function VehicleDetail({
  id,
  branches,
  isAdmin,
  onClose,
  onEdit,
  onChanged,
  onStartDeal,
}: {
  id: string | null;
  branches: Branch[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (v: Vehicle) => void;
  onChanged: () => void;
  onStartDeal: (vehicleId: string) => void;
}) {
  const [data, setData] = useState<{ vehicle: Vehicle; deals: Deal[]; interested: { _id: string; name: string; phone?: string; stage: string }[] } | null>(null);
  const [photo, setPhoto] = useState(0);
  const [recon, setRecon] = useState({ description: "", vendor: "", amount: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api(`/api/dealership/vehicles/${id}`));
      setMsg("");
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setPhoto(0);
    load();
  }, [load]);

  async function act(body: unknown) {
    try {
      await api(`/api/dealership/vehicles/${id}`, { method: "POST", json: body });
      await load();
      onChanged();
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    }
  }

  async function addRecon(e: FormEvent) {
    e.preventDefault();
    if (await act({ action: "recon", recon: { ...recon, amount: Number(recon.amount) } })) {
      setRecon({ description: "", vendor: "", amount: "" });
    }
  }

  async function transfer(code: string) {
    if (code && confirm(`Move this vehicle to ${code}?`)) await act({ action: "transfer", toBranchCode: code });
  }

  async function remove() {
    if (!confirm("Delete this vehicle and its accounting entries?")) return;
    try {
      await api(`/api/dealership/vehicles/${id}`, { method: "DELETE" });
      onChanged();
      onClose();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  const v = data?.vehicle;
  const sellable = v && v.status !== "sold" && v.status !== "reserved";

  return (
    <Sheet
      open={Boolean(id)}
      title={v ? v.label : "Vehicle"}
      subtitle={v ? <>{v.stockNo} · {v.branchCode} · <Pill value={v.status} /></> : null}
      onClose={onClose}
      actions={
        v ? (
          <>
            {sellable ? <button type="button" className="btn-primary" onClick={() => onStartDeal(v._id)}>Start deal</button> : null}
            {v.status !== "sold" ? <button type="button" className="btn-ghost" onClick={() => onEdit(v)}>Edit</button> : null}
          </>
        ) : null
      }
    >
      {msg ? <div className="alert err">{msg}</div> : null}
      {!v ? (
        <EmptyState message="Loading…" />
      ) : (
        <>
          <div className="dl-detail">
            <div>
              <div className="dl-hero-photo" style={v.photos[photo] ? { backgroundImage: `url("${v.photos[photo]}")` } : undefined}>
                {!v.photos.length ? <span>No photos yet</span> : null}
              </div>
              {v.photos.length > 1 ? (
                <div className="dl-thumbs">
                  {v.photos.map((p, i) => (
                    <button type="button" key={p} className={i === photo ? "active" : ""} style={{ backgroundImage: `url("${p}")` }} onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} />
                  ))}
                </div>
              ) : null}
              {v.features.length ? (
                <div className="chips" style={{ marginTop: 10 }}>
                  {v.features.map((f) => <span key={f} className="filter-chip">{f}</span>)}
                </div>
              ) : null}
            </div>
            <div>
              <dl className="dl-specs">
                <dt>VIN</dt><dd>{v.vin || "—"}</dd>
                <dt>Registration</dt><dd>{v.registrationNo || "—"}</dd>
                <dt>Mileage</dt><dd>{v.mileage.toLocaleString()} km</dd>
                <dt>Body / fuel</dt><dd>{v.bodyType || "—"} · {v.fuel || "—"}</dd>
                <dt>Transmission</dt><dd>{v.transmission || "—"}{v.engineCc ? ` · ${v.engineCc} cc` : ""}</dd>
                <dt>Colour</dt><dd>{v.color || "—"}</dd>
                <dt>Condition</dt><dd>{label(v.condition)}</dd>
                <dt>Acquired</dt><dd>{prettyDate(v.acquiredAt)}{v.acquiredFrom ? ` · ${v.acquiredFrom}` : ""}</dd>
                <dt>Days in stock</dt><dd style={{ color: v.daysInStock > 90 ? "var(--red)" : undefined }}>{v.daysInStock}</dd>
              </dl>
              <div className="dl-costs">
                <div><span>Purchase</span><b>{pkr(v.purchaseCost)}</b></div>
                <div><span>Reconditioning</span><b>{pkr(v.reconTotal)}</b></div>
                <div><span>Total cost</span><b>{pkr(v.totalCost)}</b></div>
                <div><span>List price</span><b>{pkr(v.listPrice)}</b></div>
                <div><span>Floor price</span><b>{pkr(v.floorPrice)}</b></div>
                <div className="total"><span>Margin at list</span><b style={{ color: v.potentialGross < 0 ? "var(--red)" : "var(--jade-dark)" }}>{pkr(v.potentialGross)}</b></div>
              </div>
            </div>
          </div>

          <div className="form-section-title">Reconditioning & prep costs</div>
          {v.recon.length ? (
            <table className="reg">
              <tbody>
                {v.recon.map((r) => (
                  <tr key={r._id}>
                    <td>{prettyDate(r.date)}</td>
                    <td>{r.description}{r.vendor ? <span className="muted small"> · {r.vendor}</span> : null}</td>
                    <td className="num">{pkr(r.amount)}</td>
                    <td className="right">
                      {v.status !== "sold" ? (
                        <button type="button" className="link-btn danger" onClick={() => act({ action: "remove_recon", reconId: r._id })}>Remove</button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="muted small">No recon work logged.</div>
          )}
          {v.status !== "sold" ? (
            <form className="dl-inline-form" onSubmit={addRecon}>
              <input className={inputClass} placeholder="Work done (e.g. Detailing, new tyres)" value={recon.description} onChange={(e) => setRecon({ ...recon, description: e.target.value })} required />
              <input className={inputClass} placeholder="Vendor" value={recon.vendor} onChange={(e) => setRecon({ ...recon, vendor: e.target.value })} />
              <input className={inputClass} type="number" min={1} placeholder="Amount" value={recon.amount} onChange={(e) => setRecon({ ...recon, amount: e.target.value })} required />
              <button type="submit" className="btn-dark">Add cost</button>
            </form>
          ) : null}

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div>
              <div className="form-section-title">Deals on this unit</div>
              {data.deals.length ? (
                <table className="reg">
                  <tbody>
                    {data.deals.map((d) => (
                      <tr key={d._id}>
                        <td><b>{d.number}</b><div className="muted small">{d.customerName}</div></td>
                        <td><Pill value={d.status} /></td>
                        <td className="num">{pkr(d.totals.vehicleNet)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="muted small">No deals yet.</div>
              )}
            </div>
            <div>
              <div className="form-section-title">Interested leads</div>
              {data.interested.length ? (
                <ul className="dl-list">
                  {data.interested.map((c) => (
                    <li key={c._id}>{c.name} <span className="muted small">{c.phone || ""}</span> <Pill value={c.stage} /></li>
                  ))}
                </ul>
              ) : (
                <div className="muted small">No open leads tagged to this vehicle.</div>
              )}
            </div>
          </div>

          <div className="dl-footer-actions">
            {sellable && branches.length > 1 ? (
              <select className={inputClass} value="" onChange={(e) => transfer(e.target.value)}>
                <option value="">Transfer to branch…</option>
                {branches.filter((b) => b.code !== v.branchCode).map((b) => (
                  <option key={b.code} value={b.code}>{b.code} — {b.name}</option>
                ))}
              </select>
            ) : null}
            {isAdmin && sellable ? <button type="button" className="link-btn danger" onClick={remove}>Delete vehicle</button> : null}
          </div>
        </>
      )}
    </Sheet>
  );
}
