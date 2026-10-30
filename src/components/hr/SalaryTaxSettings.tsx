"use client";

import { useEffect, useState } from "react";
import { EmptyState, Panel, inputClass } from "@/components/ui";
import { formatNumber } from "@/lib/types";

type Config = {
  preset: string;
  yearStartMonth: number;
  slabs: { from: number; rate: number }[];
  standardDeduction: number;
  rebateUpTo: number;
  cessPercent: number;
  medicalExemptPercent: number;
  certificateTitle: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Yearly tax for a yearly taxable salary — same rule as the server, for the preview. */
function yearlyTax(income: number, c: Config) {
  const base = Math.max(0, income - (c.standardDeduction || 0));
  if (c.rebateUpTo && base <= c.rebateUpTo) return 0;
  const slabs = [...c.slabs].sort((a, b) => a.from - b.from);
  let tax = 0;
  slabs.forEach((s, i) => {
    const upper = slabs[i + 1]?.from ?? Infinity;
    if (base > s.from) tax += ((Math.min(base, upper) - s.from) * s.rate) / 100;
  });
  return tax * (1 + (c.cessPercent || 0) / 100);
}

/** "Rs 6,000 + 11% of the amount exceeding Rs 1,200,000" — the slab as the Finance Act words it. */
function slabText(c: Config, i: number) {
  const slabs = [...c.slabs].sort((a, b) => a.from - b.from);
  const s = c.slabs[i];
  if (!s.rate) return "Tax free";
  const fixed = Math.round(yearlyTax(s.from + (c.standardDeduction || 0), { ...c, rebateUpTo: 0, cessPercent: 0, slabs }));
  return `${fixed ? `${formatNumber(fixed)} + ` : ""}${s.rate}% of the amount exceeding ${formatNumber(s.from)}`;
}

/** Salary income-tax rules: pick a country preset or edit the slabs. */
export function SalaryTaxSettings({ editable }: { editable: boolean }) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [presets, setPresets] = useState<{ preset: string; label: string }[]>([]);
  const [employerTaxNumber, setEmployerTaxNumber] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sample, setSample] = useState("100000");

  useEffect(() => {
    fetch("/api/hr/salary-tax")
      .then((r) => r.json())
      .then((d) => {
        setCfg(d.config);
        setPresets(d.presets || []);
      });
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setEmployerTaxNumber(d.settings?.employerTaxNumber || ""));
  }, []);

  async function save(body: Record<string, unknown>) {
    setMsg(null);
    const res = await fetch("/api/hr/salary-tax", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!res.ok) return setMsg({ ok: false, text: d.error || "Could not save" });
    setCfg(d.config);
    setMsg({ ok: true, text: "Saved. New payslips use these rules." });
  }

  if (!cfg) return <Panel title="Salary Tax"><EmptyState message="Loading…" /></Panel>;
  const monthly = Number(sample) || 0;
  const yearTax = yearlyTax(monthly * 12, cfg);
  const set = (k: keyof Config, v: number | string) => setCfg({ ...cfg, [k]: v });

  return (
    <Panel title="Salary Tax Rules" meta={presets.find((p) => p.preset === cfg.preset)?.label.toUpperCase() || "CUSTOM"}>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
      {editable ? (
        <div className="chips" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Start from:</span>
          {presets.map((p) => (
            <button key={p.preset} type="button" className={`filter-chip${cfg.preset === p.preset ? " active" : ""}`} onClick={() => save({ preset: p.preset })}>
              {p.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid-2">
        <div>
          <table className="reg report-table">
            <thead>
              <tr><th>Yearly taxable salary above</th><th className="right">Tax rate on that part</th><th>Tax on this slab</th>{editable ? <th /> : null}</tr>
            </thead>
            <tbody>
              {cfg.slabs.map((s, i) => (
                <tr key={i}>
                  <td>
                    {editable ? (
                      <input type="number" min={0} className={inputClass} value={s.from} onChange={(e) => setCfg({ ...cfg, slabs: cfg.slabs.map((x, j) => (j === i ? { ...x, from: Number(e.target.value) } : x)) })} />
                    ) : (
                      formatNumber(s.from)
                    )}
                  </td>
                  <td className="num">
                    {editable ? (
                      <input type="number" min={0} max={100} step="0.5" className={inputClass} value={s.rate} onChange={(e) => setCfg({ ...cfg, slabs: cfg.slabs.map((x, j) => (j === i ? { ...x, rate: Number(e.target.value) } : x)) })} />
                    ) : (
                      `${s.rate}%`
                    )}
                  </td>
                  <td className="cell-sub">{slabText(cfg, i)}</td>
                  {editable ? (
                    <td>
                      <button type="button" className="link-btn danger" onClick={() => setCfg({ ...cfg, slabs: cfg.slabs.filter((_, j) => j !== i) })}>Remove</button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {editable ? (
            <button type="button" className="link-btn" onClick={() => setCfg({ ...cfg, slabs: [...cfg.slabs, { from: (cfg.slabs.at(-1)?.from || 0) + 500000, rate: 0 }] })}>
              + Add slab
            </button>
          ) : null}
        </div>
        <div className="af-grid">
          <label>
            <span>Tax year starts in</span>
            <select className={inputClass} disabled={!editable} value={cfg.yearStartMonth} onChange={(e) => set("yearStartMonth", Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label>
            <span>Tax-free medical allowance (% of basic)</span>
            <input type="number" min={0} className={inputClass} disabled={!editable} value={cfg.medicalExemptPercent} onChange={(e) => set("medicalExemptPercent", Number(e.target.value))} />
          </label>
          <label>
            <span>Standard deduction (yearly)</span>
            <input type="number" min={0} className={inputClass} disabled={!editable} value={cfg.standardDeduction} onChange={(e) => set("standardDeduction", Number(e.target.value))} />
          </label>
          <label>
            <span>No tax if yearly income up to</span>
            <input type="number" min={0} className={inputClass} disabled={!editable} value={cfg.rebateUpTo} onChange={(e) => set("rebateUpTo", Number(e.target.value))} />
          </label>
          <label>
            <span>Cess / surcharge on tax (%)</span>
            <input type="number" min={0} className={inputClass} disabled={!editable} value={cfg.cessPercent} onChange={(e) => set("cessPercent", Number(e.target.value))} />
          </label>
          <label>
            <span>School&apos;s tax number (NTN / TAN)</span>
            <input className={inputClass} disabled={!editable} value={employerTaxNumber} onChange={(e) => setEmployerTaxNumber(e.target.value)} />
          </label>
          <label className="af-wide">
            <span>Certificate title</span>
            <input className={inputClass} disabled={!editable} value={cfg.certificateTitle} onChange={(e) => set("certificateTitle", e.target.value)} />
          </label>
        </div>
      </div>

      <div className="statement-result" style={{ marginTop: 12 }}>
        <span>
          Check: a monthly taxable salary of{" "}
          <input type="number" className={inputClass} style={{ width: 120, display: "inline-block" }} value={sample} onChange={(e) => setSample(e.target.value)} /> pays
        </span>
        <strong>{formatNumber(Math.round(yearTax / 12))} / month · {formatNumber(Math.round(yearTax))} / year</strong>
      </div>

      {editable ? (
        <div className="form-actions">
          <button type="button" className="btn-dark" onClick={() => save({ ...cfg, preset: undefined, employerTaxNumber })}>Save tax rules</button>
        </div>
      ) : null}
      <p className="coa-hint">
        Tax rules change with each budget — check the slabs against the latest Finance Act before the new tax year.
      </p>
    </Panel>
  );
}
