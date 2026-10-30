"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, Field, ModalForm, inputClass } from "@/components/ui";
import { formatNumber } from "@/lib/types";

type Context = "fees" | "payments" | "receipts" | "sales";
type TaxType = "gst" | "vat" | "sales_tax" | "withholding" | "other";

type Tax = {
  _id: string;
  name: string;
  code: string;
  type: TaxType;
  rate: number;
  appliesTo: Context[];
  autoApply: boolean;
  inclusive: boolean;
  threshold: number;
  isActive: boolean;
  accountCode: string;
  accountName: string;
  description?: string;
};

type Preset = Partial<Tax> & { key: string; note: string };

const CONTEXTS: { key: Context; label: string; hint: string }[] = [
  { key: "fees", label: "Student fee vouchers", hint: "Added as its own line on every fee voucher above the threshold" },
  { key: "payments", label: "Payment & expense vouchers", hint: "Offered on cash / bank payments" },
  { key: "receipts", label: "Receipt vouchers", hint: "Offered on cash / bank receipts" },
  { key: "sales", label: "Store & course sales", hint: "Charged on store sales and distance-learning fees" },
];

const TYPES: { key: TaxType; label: string }[] = [
  { key: "gst", label: "Sales tax / GST — added to the amount" },
  { key: "vat", label: "VAT — added to the amount" },
  { key: "withholding", label: "Withholding / advance tax — deducted or collected" },
  { key: "other", label: "Other" },
];

const blank: Partial<Tax> = { name: "", code: "", type: "gst", rate: 0, appliesTo: [], autoApply: false, inclusive: false, threshold: 0, isActive: true };

/**
 * Settings → Finance → Taxes: every tax the school deals with, defined once and applied where it
 * belongs — fee vouchers, payment / receipt vouchers and sales. Salary tax has its own slabs in HR.
 */
export function TaxSettings() {
  const [taxes, setTaxes] = useState<Tax[] | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [form, setForm] = useState<Partial<Tax> | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/taxes")
      .then((r) => r.json())
      .then((d) => {
        setTaxes(d.taxes || []);
        setPresets(d.presets || []);
      })
      .catch(() => setTaxes([]));
  useEffect(() => {
    load();
  }, []);

  function open(t: Partial<Tax>, hint = "") {
    setMsg(null);
    setNote(hint);
    setForm({ ...blank, ...t });
  }

  async function save() {
    if (!form) return;
    const res = await fetch(form._id ? `/api/taxes/${form._id}` : "/api/taxes", {
      method: form._id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      setMsg({ ok: false, text: d.error || "Could not save the tax" });
      return;
    }
    setForm(null);
    setMsg({ ok: true, text: `${d.tax.name} saved — posts to ${d.tax.accountName} (${d.tax.accountCode}).` });
    load();
  }

  async function toggle(t: Tax) {
    await fetch(`/api/taxes/${t._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    load();
  }

  async function remove(t: Tax) {
    if (!confirm(`Remove ${t.name}?\nIts account (${t.accountName}) stays in the chart of accounts with everything already posted.`)) return;
    await fetch(`/api/taxes/${t._id}`, { method: "DELETE" });
    load();
  }

  const set = (patch: Partial<Tax>) => form && setForm({ ...form, ...patch });
  const withholding = form?.type === "withholding";
  const unused = presets.filter((p) => !taxes?.some((t) => t.code === p.code));

  return (
    <div className="stack">
      <div className="tax-head">
        <div>
          <p>
            Set each tax once; it is applied wherever it belongs and posts to its own payable account. Salary income
            tax follows the slabs in <Link href="/hr">HR → Salary Tax</Link>.
          </p>
        </div>
        <button type="button" className="btn-dark" onClick={() => open({})}>
          + Add tax
        </button>
      </div>

      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}

      {!taxes ? (
        <EmptyState message="Loading taxes…" />
      ) : !taxes.length ? (
        <EmptyState message="No taxes yet. Add one, or start from a Pakistan preset below." />
      ) : (
        <div className="table-scroll">
          <table className="reg">
            <thead>
              <tr>
                <th>Tax</th>
                <th className="right">Rate</th>
                <th>Applies to</th>
                <th>Posts to</th>
                <th className="right">Status</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {taxes.map((t) => (
                <tr key={t._id}>
                  <td>
                    <b>{t.name}</b>
                    <div className="cell-sub">
                      {t.code} · {t.type === "withholding" ? "withholding / advance" : t.inclusive ? "included in price" : "added on top"}
                      {t.threshold ? ` · above ${formatNumber(t.threshold)}` : ""}
                    </div>
                  </td>
                  <td className="num">{t.rate}%</td>
                  <td>
                    <div className="chips">
                      {t.appliesTo.length ? (
                        t.appliesTo.map((c) => (
                          <span key={c} className="badge">
                            {CONTEXTS.find((x) => x.key === c)?.label}
                            {t.autoApply && c !== "fees" ? " · auto" : ""}
                          </span>
                        ))
                      ) : (
                        <span className="cell-sub">Nowhere yet</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {t.accountName}
                    <div className="cell-sub">{t.accountCode}</div>
                  </td>
                  <td className="right">
                    <span className={`badge ${t.isActive ? "present" : ""}`}>{t.isActive ? "Active" : "Off"}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="link-btn" onClick={() => open(t)}>Edit</button>
                      <button type="button" className="link-btn" onClick={() => toggle(t)}>{t.isActive ? "Turn off" : "Turn on"}</button>
                      <button type="button" className="link-btn danger" onClick={() => remove(t)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unused.length ? (
        <div className="tax-presets">
          <span>Pakistan presets:</span>
          {unused.map((p) => (
            <button key={p.key} type="button" className="filter-chip" onClick={() => open({ ...p, key: undefined } as Partial<Tax>, p.note)}>
              + {p.name}
            </button>
          ))}
        </div>
      ) : null}

      <ModalForm
        title={form?._id ? `Edit ${form.name}` : "Add a tax"}
        subtitle="Check rates against the latest Finance Act / FBR notices"
        open={Boolean(form)}
        onClose={() => setForm(null)}
        onSubmit={save}
        wide
      >
        {form ? (
          <div className="stack">
            {note ? <div className="alert">{note}</div> : null}
            {msg && !msg.ok ? <div className="alert err">{msg.text}</div> : null}
            <div className="form-grid">
              <Field label="Tax name" required>
                <input className={inputClass} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Advance Tax on Fee (236I)" required />
              </Field>
              <Field label="Short code">
                <input className={inputClass} value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="e.g. ADV236I" />
              </Field>
              <Field label="Kind of tax">
                <select className={inputClass} value={form.type} onChange={(e) => set({ type: e.target.value as TaxType })}>
                  {TYPES.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rate %" required>
                <input type="number" min={0} max={100} step="0.01" className={inputClass} value={form.rate} onChange={(e) => set({ rate: Number(e.target.value) })} required />
              </Field>
              <Field label="Only when the amount is above">
                <input type="number" min={0} className={inputClass} value={form.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />
              </Field>
              {!withholding ? (
                <Field label="Price">
                  <select className={inputClass} value={form.inclusive ? "in" : "out"} onChange={(e) => set({ inclusive: e.target.value === "in" })}>
                    <option value="out">Tax added on top of the amount</option>
                    <option value="in">Amount already includes the tax</option>
                  </select>
                </Field>
              ) : null}
            </div>
            <div>
              <div className="field-label">Applies to</div>
              <div className="tax-contexts">
                {CONTEXTS.map((c) => (
                  <label key={c.key} className="check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(form.appliesTo?.includes(c.key))}
                      onChange={(e) =>
                        set({ appliesTo: e.target.checked ? [...(form.appliesTo || []), c.key] : (form.appliesTo || []).filter((x) => x !== c.key) })
                      }
                    />
                    <span>
                      <b>{c.label}</b>
                      <small>{c.hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label className="check-row">
              <input type="checkbox" checked={Boolean(form.autoApply)} onChange={(e) => set({ autoApply: e.target.checked })} />
              Pick this tax automatically on new payment / receipt vouchers (it can still be changed on each voucher)
            </label>
            <p className="coa-hint">
              {withholding
                ? "On payments it is deducted from the amount paid; on fee vouchers it is added as its own line. Either way it is owed to the government and posts to this tax's payable account."
                : "On receipts and sales it is owed to the government (payable); on payments it is input tax you can claim back."}
            </p>
          </div>
        ) : null}
      </ModalForm>
    </div>
  );
}
