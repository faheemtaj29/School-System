"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { EmptyState, Panel } from "@/components/ui";
import { formatNumber, prettyDate } from "@/lib/types";
import { Picker } from "./QbVoucher";

type Period = { branch: string; from: string; to: string };

function query(p: Period, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  if (p.branch) q.set("branch", p.branch);
  if (p.from) q.set("from", p.from);
  if (p.to) q.set("to", p.to);
  return q.toString();
}

function useReport<T>(view: string, p: Period, extra: Record<string, string> = {}) {
  const [data, setData] = useState<T | null>(null);
  const qs = query(p, { view, ...extra });
  useEffect(() => {
    let live = true;
    fetch(`/api/accounting?${qs}`)
      .then((r) => r.json())
      .then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [qs]);
  return data;
}

const drCr = (n: number) => (n ? `${formatNumber(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}` : "0");
const amt = (n: number) => (n ? formatNumber(n) : "");

/* ---------------- Whole general ledger ---------------- */

type LedgerAccount = {
  code: string;
  name: string;
  type: string;
  opening: number;
  rows: { voucherId: string; number: string; docLink: string; date: string; narration: string; contra: string; debit: number; credit: number; balance: number }[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
};

/**
 * QuickBooks-style General Ledger: every account (or one account / one main head) with its
 * opening balance, each posting date-wise with running balance, and the closing balance.
 */
export function FullLedgerReport({
  period,
  accounts,
}: {
  period: Period;
  accounts: { code: string; name: string; level: number; isPosting: boolean }[];
}) {
  const [account, setAccount] = useState("");
  const [head, setHead] = useState("");
  const data = useReport<{ accounts: LedgerAccount[]; totalDebit: number; totalCredit: number }>(
    "full-ledger",
    period,
    { ...(account ? { account } : {}), ...(head ? { head } : {}) }
  );
  const heads = accounts.filter((a) => a.level === 1).sort((a, b) => a.code.localeCompare(b.code));
  const options = useMemo(
    () => accounts.filter((a) => a.isPosting).map((a) => ({ value: a.code, code: a.code, label: a.name })),
    [accounts]
  );
  const list = data?.accounts || [];

  return (
    <Panel title="General Ledger" meta={data ? `${list.length} ACCOUNTS` : "LOADING"}>
      <div className="chips no-print" style={{ marginBottom: 10 }}>
        <button type="button" className={`filter-chip${!head ? " active" : ""}`} onClick={() => setHead("")}>All heads</button>
        {heads.map((h) => (
          <button key={h.code} type="button" className={`filter-chip${head === h.code ? " active" : ""}`} onClick={() => setHead(h.code)}>
            {h.code} {h.name}
          </button>
        ))}
      </div>
      <div className="pl-filters no-print">
        <label className="pl-account">
          <span>Account (leave empty for the whole ledger)</span>
          <Picker value={account} options={options} placeholder="All accounts — or type a name / code…" onChange={(v) => setAccount(v)} />
        </label>
        {account ? (
          <button type="button" className="btn-ghost" onClick={() => setAccount("")}>Show all accounts</button>
        ) : null}
        <button
          type="button"
          className="btn-dark"
          onClick={() => window.open(`/print/general-ledger?${query(period, { ...(account ? { account } : {}), ...(head ? { head } : {}) })}`, "_blank")}
        >
          Print ledger
        </button>
      </div>

      {!data ? (
        <EmptyState message="Loading ledger…" />
      ) : !list.length ? (
        <EmptyState message="No postings in this period." />
      ) : (
        <div className="table-scroll">
          <table className="reg report-table gl-table">
            <thead>
              <tr>
                <th style={{ width: 105 }}>Date</th>
                <th style={{ width: 160 }}>Voucher no.</th>
                <th>Description</th>
                <th>Against</th>
                <th className="right" style={{ width: 110 }}>Debit</th>
                <th className="right" style={{ width: 110 }}>Credit</th>
                <th className="right" style={{ width: 130 }}>Balance</th>
              </tr>
            </thead>
            {list.map((a) => (
              <tbody key={a.code}>
                <tr className="gl-head">
                  <td colSpan={7}>
                    <b>{a.code} · {a.name}</b>
                    <span>{a.type}</span>
                  </td>
                </tr>
                <tr className="gl-open">
                  <td>{period.from ? prettyDate(period.from) : ""}</td>
                  <td colSpan={5}>Opening balance</td>
                  <td className="num">{drCr(a.opening)}</td>
                </tr>
                {a.rows.map((r, i) => (
                  <tr key={`${r.voucherId}-${i}`}>
                    <td>{prettyDate(r.date)}</td>
                    <td className="num"><a href={r.docLink} target="_blank" rel="noreferrer">{r.number}</a></td>
                    <td>{r.narration}</td>
                    <td className="gl-dim">{r.contra}</td>
                    <td className="num">{amt(r.debit)}</td>
                    <td className="num">{amt(r.credit)}</td>
                    <td className="num">{drCr(r.balance)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={4}><strong>Total {a.name} / closing</strong></td>
                  <td className="num"><strong>{formatNumber(a.totalDebit)}</strong></td>
                  <td className="num"><strong>{formatNumber(a.totalCredit)}</strong></td>
                  <td className="num"><strong>{drCr(a.closing)}</strong></td>
                </tr>
              </tbody>
            ))}
            <tbody>
              <tr className="total-row gl-grand">
                <td colSpan={4}><strong>GRAND TOTAL</strong></td>
                <td className="num"><strong>{formatNumber(data.totalDebit)}</strong></td>
                <td className="num"><strong>{formatNumber(data.totalCredit)}</strong></td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Adjusted trial balance ---------------- */

type AdjRow = {
  code: string;
  name: string;
  type: string;
  unadjustedDebit: number;
  unadjustedCredit: number;
  adjDebit: number;
  adjCredit: number;
  debit: number;
  credit: number;
};

export function AdjustedTrialBalance({ period }: { period: Period }) {
  const data = useReport<{ rows: AdjRow[]; totals: Omit<AdjRow, "code" | "name" | "type"> }>("adjusted-trial-balance", period);
  if (!data) return <Panel title="Adjusted Trial Balance" meta="LOADING"><EmptyState message="Loading…" /></Panel>;
  const t = data.totals;
  const balanced = Math.abs(t.debit - t.credit) < 0.01;
  return (
    <Panel title="Adjusted Trial Balance" meta={balanced ? "BALANCED" : "OUT OF BALANCE"}>
      {!data.rows.length ? (
        <EmptyState message="No posted balances yet." />
      ) : (
        <div className="table-scroll">
          <table className="reg report-table">
            <thead>
              <tr>
                <th rowSpan={2}>Code</th>
                <th rowSpan={2}>Account</th>
                <th className="right" colSpan={2}>Unadjusted</th>
                <th className="right" colSpan={2}>Adjustments</th>
                <th className="right" colSpan={2}>Adjusted</th>
              </tr>
              <tr>
                <th className="right">Debit</th><th className="right">Credit</th>
                <th className="right">Debit</th><th className="right">Credit</th>
                <th className="right">Debit</th><th className="right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.code}>
                  <td className="num">{r.code}</td>
                  <td>{r.name}</td>
                  <td className="num">{amt(r.unadjustedDebit)}</td>
                  <td className="num">{amt(r.unadjustedCredit)}</td>
                  <td className="num">{amt(r.adjDebit)}</td>
                  <td className="num">{amt(r.adjCredit)}</td>
                  <td className="num">{amt(r.debit)}</td>
                  <td className="num">{amt(r.credit)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={2}><strong>TOTAL</strong></td>
                <td className="num"><strong>{formatNumber(t.unadjustedDebit)}</strong></td>
                <td className="num"><strong>{formatNumber(t.unadjustedCredit)}</strong></td>
                <td className="num"><strong>{formatNumber(t.adjDebit)}</strong></td>
                <td className="num"><strong>{formatNumber(t.adjCredit)}</strong></td>
                <td className="num"><strong>{formatNumber(t.debit)}</strong></td>
                <td className="num"><strong>{formatNumber(t.credit)}</strong></td>
              </tr>
            </tbody>
          </table>
          <p className="coa-hint">Adjustments are journal entries marked “Adjusting entry” (accruals, prepayments, depreciation) in this period.</p>
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Partners' profit share ---------------- */

export type Distribution = {
  profit: number;
  partners: { code: string; name: string; sharePercent: number; amount: number }[];
  totalShare: number;
  retained: number;
};

export function ProfitDistribution({ distribution }: { distribution: Distribution }) {
  if (!distribution.partners.length) {
    return (
      <p className="coa-hint">
        To split profit between owners, add each partner under Chart of Accounts → 3 Equity → Capital → Capital Funds →
        Partners&apos; Capital, with their share %.
      </p>
    );
  }
  return (
    <div className="statement-section">
      <div className="form-section-title">Distribution of {distribution.profit >= 0 ? "profit" : "loss"} between partners</div>
      <table className="reg report-table">
        <tbody>
          {distribution.partners.map((p) => (
            <tr key={p.code}>
              <td>{p.name} <span style={{ color: "var(--text-dim)" }}>({p.sharePercent}%)</span></td>
              <td className="num">{formatNumber(p.amount)}</td>
            </tr>
          ))}
          {distribution.retained ? (
            <tr>
              <td>Not shared — kept as retained surplus ({Math.round((100 - distribution.totalShare) * 100) / 100}%)</td>
              <td className="num">{formatNumber(distribution.retained)}</td>
            </tr>
          ) : null}
          <tr className="total-row">
            <td><strong>Net {distribution.profit >= 0 ? "profit" : "loss"}</strong></td>
            <td className="num"><strong>{formatNumber(distribution.profit)}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Statement of changes in equity ---------------- */

type EquityRow = { code: string; name: string; sharePercent: number; opening: number; introduced: number; profit: number; drawings: number; closing: number };

export function EquityStatement({ period }: { period: Period }) {
  const data = useReport<{ profit: number; rows: EquityRow[]; totals: Omit<EquityRow, "code" | "name" | "sharePercent"> }>("equity-statement", period);
  if (!data) return <Panel title="Statement of Changes in Equity" meta="LOADING"><EmptyState message="Loading…" /></Panel>;
  return (
    <Panel title="Statement of Changes in Equity" meta={`NET ${data.profit >= 0 ? "PROFIT" : "LOSS"} ${formatNumber(Math.abs(data.profit))}`}>
      <div className="table-scroll">
        <table className="reg report-table">
          <thead>
            <tr>
              <th>Owner / partner</th>
              <th className="right">Share</th>
              <th className="right">Opening capital</th>
              <th className="right">Capital introduced</th>
              <th className="right">Share of profit / (loss)</th>
              <th className="right">Drawings</th>
              <th className="right">Closing capital</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.code || r.name}>
                <td>{r.code ? <span className="num">{r.code} · </span> : null}{r.name}</td>
                <td className="num">{r.sharePercent ? `${r.sharePercent}%` : ""}</td>
                <td className="num">{formatNumber(r.opening)}</td>
                <td className="num">{formatNumber(r.introduced)}</td>
                <td className="num">{formatNumber(r.profit)}</td>
                <td className="num">{r.drawings ? `(${formatNumber(r.drawings)})` : "0"}</td>
                <td className="num"><strong>{formatNumber(r.closing)}</strong></td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={2}><strong>TOTAL EQUITY</strong></td>
              <td className="num"><strong>{formatNumber(data.totals.opening)}</strong></td>
              <td className="num"><strong>{formatNumber(data.totals.introduced)}</strong></td>
              <td className="num"><strong>{formatNumber(data.totals.profit)}</strong></td>
              <td className="num"><strong>({formatNumber(data.totals.drawings)})</strong></td>
              <td className="num"><strong>{formatNumber(data.totals.closing)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="coa-hint">
        Each partner&apos;s share of profit uses the % set on their capital account in the chart of accounts. Drawings are
        the payments posted to the partner&apos;s drawings account.
      </p>
    </Panel>
  );
}

/* ---------------- Aging (payables / receivables) ---------------- */

type AgingBuckets = { current: number; d30: number; d60: number; d90: number; over90: number; total: number };
type AgingRow = AgingBuckets & { code: string; name: string; group: string; oldest: string | null };

const AGING_COLS: [keyof AgingBuckets, string][] = [
  ["current", "Current"],
  ["d30", "1 – 30 days"],
  ["d60", "31 – 60 days"],
  ["d90", "61 – 90 days"],
  ["over90", "Over 90 days"],
];

/** QuickBooks-style A/P and A/R aging: how much is owed, and how long it has been outstanding. */
export function AgingReport({ period }: { period: Period }) {
  const [kind, setKind] = useState<"payable" | "receivable">("payable");
  const data = useReport<{ asOf: string; rows: AgingRow[]; totals: AgingBuckets }>("aging", period, { kind });
  const groups = useMemo(() => {
    const map = new Map<string, AgingRow[]>();
    for (const r of data?.rows ?? []) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    }
    return [...map.entries()];
  }, [data]);
  const title = kind === "payable" ? "Payables Aging — what we owe" : "Receivables Aging — what we are owed";

  return (
    <Panel title={title} meta={data ? `AS OF ${prettyDate(data.asOf).toUpperCase()}` : "LOADING"}>
      <div className="tabs no-print" style={{ marginBottom: 12 }}>
        <button type="button" className={`tab${kind === "payable" ? " active" : ""}`} onClick={() => setKind("payable")}>
          Payables (suppliers)
        </button>
        <button type="button" className={`tab${kind === "receivable" ? " active" : ""}`} onClick={() => setKind("receivable")}>
          Receivables (students &amp; customers)
        </button>
      </div>
      {!data ? (
        <EmptyState message="Loading…" />
      ) : !data.rows.length ? (
        <EmptyState message={kind === "payable" ? "Nothing owed to suppliers." : "Nothing outstanding from students or customers."} />
      ) : (
        <div className="table-scroll">
          <table className="reg report-table">
            <thead>
              <tr>
                <th>{kind === "payable" ? "Supplier" : "Name"}</th>
                {AGING_COLS.map(([k, label]) => (
                  <th key={k} className="right">{label}</th>
                ))}
                <th className="right">Total</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, rows]) => (
                <Fragment key={group}>
                  {groups.length > 1 ? (
                    <tr className="group-row">
                      <td colSpan={AGING_COLS.length + 2}><strong>{group}</strong></td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <tr key={`${group}-${r.code}-${r.name}`}>
                      <td>{r.code ? <span className="num">{r.code} · </span> : null}{r.name}</td>
                      {AGING_COLS.map(([k]) => (
                        <td key={k} className={`num${k === "over90" && r[k] > 0 ? " aging-late" : ""}`}>{amt(r[k])}</td>
                      ))}
                      <td className="num"><strong>{formatNumber(r.total)}</strong></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              <tr className="total-row">
                <td><strong>TOTAL</strong></td>
                {AGING_COLS.map(([k]) => (
                  <td key={k} className="num"><strong>{formatNumber(data.totals[k])}</strong></td>
                ))}
                <td className="num"><strong>{formatNumber(data.totals.total)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="coa-hint">
        {kind === "payable"
          ? "Payments are set against the oldest bills first; what is left is aged from the bill date. A negative Current amount is an advance paid."
          : "Customer balances are aged from the invoice date, oldest settled first. Student fees are aged from each voucher's due date — Current means not yet due."}{" "}
        Use the “To” date to see the position on an earlier day.
      </p>
    </Panel>
  );
}
