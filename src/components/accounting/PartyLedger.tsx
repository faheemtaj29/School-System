"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState, Panel, inputClass } from "@/components/ui";
import { formatNumber, prettyDate, toDateInput } from "@/lib/types";
import { Picker } from "./QbVoucher";

type Branch = { code: string; name: string };
type AccountRow = { code: string; name: string; group: string; bankName: string; accountNumber: string };
type Ledger = {
  account: { code: string; name: string };
  openingBalance: number;
  rows: { voucherId: string; number: string; docNumber: string; docLink: string; date: string; narration: string; debit: number; credit: number; balance: number }[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
};

function balanceText(n: number) {
  if (!n) return "0.00";
  return `${formatNumber(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}`;
}

/**
 * Plain party ledger (khata): pick campus, dates and any account — supplier, customer,
 * bank, cash, expense… — and see Voucher no. / Date / Description / Debit / Credit / Balance.
 */
export function PartyLedger({ branches, defaultBranch }: { branches: Branch[]; defaultBranch: string }) {
  const now = new Date();
  const [branch, setBranch] = useState(defaultBranch);
  const [from, setFrom] = useState(toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toDateInput(now));
  const [code, setCode] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/accounting?view=ledger-index")
      .then((r) => r.json())
      .then((d) => setAccounts(Array.isArray(d.rows) ? d.rows : []));
  }, []);

  const options = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.code,
        label: a.name,
        group: a.group,
        hint: a.accountNumber ? `A/C ${a.accountNumber}` : a.code,
      })),
    [accounts]
  );

  const query = useMemo(() => {
    const p = new URLSearchParams({ account: code, from, to });
    if (branch) p.set("branch", branch);
    return p.toString();
  }, [code, from, to, branch]);

  const datesOk = Boolean(from && to && from <= to);

  useEffect(() => {
    if (!code || !datesOk) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/accounting?view=general-ledger&${query}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setLoading(false);
        if (d.error) {
          setError(d.error);
          setLedger(null);
        } else {
          setError("");
          setLedger(d);
        }
      });
    return () => {
      live = false;
    };
  }, [query, code, datesOk]);

  const accountName = accounts.find((a) => a.code === code)?.name || "";
  const campusName = branch ? branches.find((b) => b.code === branch)?.name || branch : "All campuses";

  return (
    <Panel title="Party Ledger" meta={accountName ? accountName.toUpperCase() : "SEARCH AN ACCOUNT"}>
      <div className="pl-filters no-print">
        <label>
          <span>Campus / project</span>
          <select className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All campuses</option>
            {branches.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>From date *</span>
          <input type="date" required className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span>To date *</span>
          <input type="date" required className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="pl-account">
          <span>Account (supplier, customer, bank, cash, expense…)</span>
          <Picker
            value={code}
            options={options}
            placeholder="Type a name to search…"
            onChange={(v) => setCode(v)}
          />
        </label>
        <button
          type="button"
          className="btn-dark"
          disabled={!code || !datesOk}
          onClick={() => window.open(`/print/ledger?${query}`, "_blank")}
        >
          Print
        </button>
      </div>

      {!datesOk ? <div className="alert err">Choose both dates (From must be on or before To).</div> : null}
      {error ? <div className="alert err">{error}</div> : null}

      {!code ? (
        <EmptyState message="Search any account by name — e.g. a supplier — to open its ledger for the selected dates." />
      ) : !ledger || loading ? (
        <EmptyState message="Loading ledger…" />
      ) : (
        <>
          <div className="pl-head">
            <b>{ledger.account.name}</b>
            <span>{campusName} · {prettyDate(from)} to {prettyDate(to)}</span>
          </div>
          <div className="table-scroll">
            <table className="reg report-table pl-table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Voucher no.</th>
                  <th style={{ width: 110 }}>Date</th>
                  <th>Description</th>
                  <th className="right" style={{ width: 120 }}>Debit</th>
                  <th className="right" style={{ width: 120 }}>Credit</th>
                  <th className="right" style={{ width: 140 }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td />
                  <td>{prettyDate(from)}</td>
                  <td><strong>Opening balance</strong></td>
                  <td className="num" />
                  <td className="num" />
                  <td className="num"><strong>{balanceText(ledger.openingBalance)}</strong></td>
                </tr>
                {ledger.rows.map((r, i) => (
                  <tr key={`${r.voucherId}-${i}`}>
                    <td className="num">
                      <a href={r.docLink} target="_blank" rel="noreferrer">{r.docNumber}</a>
                    </td>
                    <td>{prettyDate(r.date)}</td>
                    <td>{r.narration}</td>
                    <td className="num">{r.debit ? formatNumber(r.debit) : ""}</td>
                    <td className="num">{r.credit ? formatNumber(r.credit) : ""}</td>
                    <td className="num">{balanceText(r.balance)}</td>
                  </tr>
                ))}
                {!ledger.rows.length ? (
                  <tr><td colSpan={6} style={{ color: "var(--text-dim)" }}>No entries between these dates.</td></tr>
                ) : null}
                <tr className="total-row">
                  <td colSpan={3}><strong>Total / closing balance</strong></td>
                  <td className="num"><strong>{formatNumber(ledger.totalDebit)}</strong></td>
                  <td className="num"><strong>{formatNumber(ledger.totalCredit)}</strong></td>
                  <td className="num"><strong>{balanceText(ledger.closingBalance)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
