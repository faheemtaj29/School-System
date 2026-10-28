"use client";

import { inputClass } from "@/components/ui";

export type PayLine = { head: string; amount: number | string };

export const EARNING_HEADS = ["House Rent", "Medical", "Conveyance", "Utility", "Special Allowance", "Overtime", "Bonus", "Arrears"];
export const DEDUCTION_HEADS = ["EOBI", "Provident Fund", "Loan / Advance Recovery", "Social Security", "Late Coming", "Other"];

export const lineTotal = (lines: PayLine[]) => lines.reduce((t, l) => t + (Number(l.amount) || 0), 0);

/**
 * Editable list of named amounts (allowances or deductions) with one-tap common heads.
 * Used on the teacher's salary structure and on each payslip.
 */
export function SalaryLines({
  title,
  lines,
  onChange,
  suggestions,
  currency,
}: {
  title: string;
  lines: PayLine[];
  onChange: (lines: PayLine[]) => void;
  suggestions: string[];
  currency?: string;
}) {
  const unused = suggestions.filter((s) => !lines.some((l) => l.head.toLowerCase() === s.toLowerCase()));
  const set = (i: number, patch: Partial<PayLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="pay-lines">
      <div className="pay-lines-head">
        <b>{title}</b>
        <span>
          {currency ? `${currency} ` : ""}
          {lineTotal(lines).toLocaleString("en-IN")}
        </span>
      </div>
      {lines.map((l, i) => (
        <div className="pay-line" key={i}>
          <input className={inputClass} value={l.head} placeholder="Name, e.g. House Rent" onChange={(e) => set(i, { head: e.target.value })} />
          <input
            type="number"
            min={0}
            className={inputClass}
            value={l.amount}
            placeholder="0"
            onChange={(e) => set(i, { amount: e.target.value })}
          />
          <button type="button" className="link-btn danger" title="Remove" onClick={() => onChange(lines.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <div className="chips">
        {unused.map((s) => (
          <button key={s} type="button" className="filter-chip" onClick={() => onChange([...lines, { head: s, amount: "" }])}>
            + {s}
          </button>
        ))}
        <button type="button" className="filter-chip" onClick={() => onChange([...lines, { head: "", amount: "" }])}>
          + Other
        </button>
      </div>
    </div>
  );
}

/** Lines ready to send: named, with a number amount. */
export function cleanLines(lines: PayLine[]) {
  return lines
    .map((l) => ({ head: l.head.trim(), amount: Number(l.amount) || 0 }))
    .filter((l) => l.head && l.amount > 0);
}
