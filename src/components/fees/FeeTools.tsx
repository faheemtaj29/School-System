"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, Field, Panel, inputClass } from "@/components/ui";
import { formatNumber } from "@/lib/types";

type Line = { head: string; amount: number };

type StructureClass = { _id: string; classLabel: string; students: number; lines: Line[]; monthly: number };

type Structure = {
  settings: {
    autoMonthlyFees: boolean;
    feeGenerateDay: number;
    feeDueDay: number;
    lastAutoFeeMonth: string | null;
    currency: string;
    feeHeads: string[];
  };
  classes: StructureClass[];
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthName(key: string) {
  const [y, m] = key.split("-").map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : key;
}

function ordinal(n: number) {
  return `${n}${n === 1 || n === 21 ? "st" : n === 2 || n === 22 ? "nd" : n === 3 || n === 23 ? "rd" : "th"}`;
}

const hint = { fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 } as const;

/** Monthly fee structure per class + automatic monthly billing. */
export function FeeStructurePanel({ onGenerated }: { onGenerated: () => void }) {
  const [data, setData] = useState<Structure | null>(null);
  const [rows, setRows] = useState<StructureClass[]>([]);
  const [auto, setAuto] = useState({ autoMonthlyFees: false, feeGenerateDay: 1, feeDueDay: 10 });
  const [month, setMonth] = useState(monthKey());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/fees/structure");
    const d = await res.json();
    if (!res.ok) return setErr(d.error || "Could not load fee structure");
    setData(d);
    setRows(d.classes);
    setAuto({
      autoMonthlyFees: d.settings.autoMonthlyFees,
      feeGenerateDay: d.settings.feeGenerateDay,
      feeDueDay: d.settings.feeDueDay,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    load();
  }, [load]);

  const heads = Array.from(
    new Set([...(data?.settings.feeHeads || []), ...rows.flatMap((r) => r.lines.map((l) => l.head))])
  );
  // Columns: every head already used by some class (Tuition Fee to start with).
  const [columns, setColumns] = useState<string[]>([]);
  useEffect(() => {
    if (!data) return;
    const used = Array.from(new Set(data.classes.flatMap((r) => r.lines.map((l) => l.head))));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive columns once data arrives
    setColumns((c) => (c.length ? c : used.length ? used : ["Tuition Fee"]));
  }, [data]);

  function amountOf(row: StructureClass, head: string) {
    return row.lines.find((l) => l.head === head)?.amount ?? 0;
  }

  function setAmount(classId: string, head: string, value: number) {
    setRows((list) =>
      list.map((r) => {
        if (r._id !== classId) return r;
        const lines = r.lines.some((l) => l.head === head)
          ? r.lines.map((l) => (l.head === head ? { ...l, amount: value } : l))
          : [...r.lines, { head, amount: value }];
        return { ...r, lines, monthly: lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) };
      })
    );
  }

  function applyToAll() {
    const src = rows.find((r) => r._id === copyFrom);
    if (!src) return;
    setRows((list) => list.map((r) => ({ ...r, lines: src.lines.map((l) => ({ ...l })), monthly: src.monthly })));
  }

  async function save(e?: FormEvent) {
    e?.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/fees/structure", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...auto,
          classes: rows.map((r) => ({
            classId: r._id,
            lines: r.lines.filter((l) => columns.includes(l.head) && Number(l.amount) > 0),
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setData(d);
      setRows(d.classes);
      setMsg(
        auto.autoMonthlyFees
          ? `Saved. Challans will be raised automatically on the ${ordinal(auto.feeGenerateDay)} of every month (due on the ${ordinal(auto.feeDueDay)}). If that day has already passed this month, this month is billed on the next check.`
          : "Fee structure saved."
      );
      onGenerated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!confirm(`Raise ${monthName(month)} challans for every class with a fee structure? Students already billed for this month are skipped.`)) return;
    setErr("");
    setMsg("");
    setBusy(true);
    try {
      const res = await fetch("/api/fees/generate-month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not generate");
      setMsg(
        `${monthName(month)}: ${d.created} challan(s) raised, ${d.skipped} already billed · ${data?.settings.currency} ${formatNumber(d.billedAmount)} receivable · due ${d.dueDate}.`
      );
      onGenerated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return err ? <div className="alert err">{err}</div> : <EmptyState message="Loading fee structure…" />;
  const cur = data.settings.currency;

  return (
    <div className="stack-lg">
      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <Panel title="Monthly billing" meta={data.settings.lastAutoFeeMonth ? `LAST AUTO RUN ${monthName(data.settings.lastAutoFeeMonth).toUpperCase()}` : "NOT RUN YET"}>
        <div className="form-grid ec-grid-4">
          <Field label="Automatic monthly challans">
            <label className="ec-check" style={{ padding: "11px 0" }}>
              <input
                type="checkbox"
                checked={auto.autoMonthlyFees}
                onChange={(e) => setAuto({ ...auto, autoMonthlyFees: e.target.checked })}
              />
              Raise challans for all students every month
            </label>
          </Field>
          <Field label="Generate on day">
            <select className={inputClass} value={auto.feeGenerateDay} onChange={(e) => setAuto({ ...auto, feeGenerateDay: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{ordinal(d)} of the month</option>
              ))}
            </select>
          </Field>
          <Field label="Due date">
            <select className={inputClass} value={auto.feeDueDay} onChange={(e) => setAuto({ ...auto, feeDueDay: Number(e.target.value) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{ordinal(d)} of the month</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={hint}>
          The app checks every hour and when the fee screen opens; each month is billed once. Students with a concession get it applied automatically.
        </div>
        <div className="fee-generate">
          <Field label="Generate a month now">
            <input type="month" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <button type="button" className="btn-dark" disabled={busy || !month} onClick={generate}>
            Generate {monthName(month)} challans
          </button>
        </div>
      </Panel>

      <Panel title="Fee structure (per month)" meta={`${rows.filter((r) => r.monthly > 0).length}/${rows.length} CLASSES SET`}>
        <form onSubmit={save}>
          <div className="fee-cols">
            {columns.map((h) => (
              <span key={h} className="ec-chip on" onClick={() => setColumns(columns.filter((c) => c !== h))} title="Remove column">
                {h} ✕
              </span>
            ))}
            <select
              className={inputClass}
              style={{ width: 200 }}
              value=""
              onChange={(e) => {
                const v = e.target.value === "__new" ? prompt("New fee head name")?.trim() : e.target.value;
                if (v && !columns.includes(v)) setColumns([...columns, v]);
              }}
            >
              <option value="">+ Add fee head…</option>
              {heads.filter((h) => !columns.includes(h)).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
              <option value="__new">Other…</option>
            </select>
          </div>
          <div className="table-scroll">
            <table className="ec-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Students</th>
                  {columns.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                  <th>Monthly total</th>
                  <th>Per month (all students)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const monthly = columns.reduce((s, h) => s + amountOf(r, h), 0);
                  return (
                    <tr key={r._id}>
                      <td><b>{r.classLabel}</b></td>
                      <td className="mono">{r.students}</td>
                      {columns.map((h) => (
                        <td key={h}>
                          <input
                            type="number"
                            min={0}
                            className={`${inputClass} ec-num`}
                            style={{ width: 96 }}
                            value={amountOf(r, h) || ""}
                            placeholder="0"
                            onChange={(e) => setAmount(r._id, h, Number(e.target.value))}
                          />
                        </td>
                      ))}
                      <td className="mono"><b>{cur} {formatNumber(monthly)}</b></td>
                      <td className="mono">{cur} {formatNumber(monthly * r.students)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-actions" style={{ alignItems: "center" }}>
            <button type="submit" className="btn-dark" disabled={busy}>
              {busy ? "Saving…" : "Save fee structure"}
            </button>
            <select className={inputClass} style={{ width: 220 }} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Copy one class to all…</option>
              {rows.map((r) => (
                <option key={r._id} value={r._id}>{r.classLabel}</option>
              ))}
            </select>
            <button type="button" className="btn-ghost" disabled={!copyFrom} onClick={applyToAll}>
              Apply to all classes
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

export type CollectTarget = {
  _id: string;
  studentName: string;
  title: string;
  amount: number;
  paidAmount: number;
};

/** Counter collection: record money received and open the 2-copy receipt. */
export function CollectModal({
  fee,
  currency,
  onClose,
  onDone,
}: {
  fee: CollectTarget;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const balance = Math.round((fee.amount - fee.paidAmount) * 100) / 100;
  const [form, setForm] = useState({
    amount: balance,
    method: "cash",
    date: new Date().toISOString().slice(0, 10),
    note: "",
  });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    // Open the tab now (inside the click) so pop-up blockers allow it; point it at the receipt after saving.
    const tab = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const res = await fetch(`/api/fees/${fee._id}/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not record payment");
      const url = `/print/fee-receipt?id=${fee._id}&receiptNo=${encodeURIComponent(d.receiptNo)}`;
      if (tab) tab.location.href = url;
      else window.open(url, "_blank");
      onDone();
    } catch (e) {
      tab?.close();
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onMouseDown={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Collect fee</h2>
        <div style={{ ...hint, marginBottom: 14 }}>
          {fee.studentName} · {fee.title}
        </div>
        <div className="ec-stats">
          <span>Voucher <b>{currency} {formatNumber(fee.amount)}</b></span>
          <span>Paid <b>{currency} {formatNumber(fee.paidAmount)}</b></span>
          <span>Balance <b>{currency} {formatNumber(balance)}</b></span>
        </div>
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Amount received" required>
            <input
              type="number"
              min={1}
              max={balance}
              step="0.01"
              className={inputClass}
              value={form.amount}
              autoFocus
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>
          <Field label="Method">
            <select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="online">Online</option>
              <option value="card">Card</option>
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Note">
            <input className={inputClass} value={form.note} placeholder="Optional" onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn-dark" disabled={busy || form.amount <= 0}>
            {busy ? "Saving…" : "Save & print receipt"}
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div style={hint}>The receipt prints with a Parent copy and an Office copy on one page.</div>
      </form>
    </div>
  );
}
