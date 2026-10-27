"use client";

import { useEffect, useState } from "react";
import { EmptyState, Panel, inputClass } from "@/components/ui";
import { formatNumber, prettyDate } from "@/lib/types";

type ItemOption = { _id: string; sku: string; name: string; unit: string };
type Branch = { code: string; name: string };

type LedgerData = {
  item: { sku: string; name: string; unit: string; unitCost: number };
  opening: number;
  rows: {
    voucherId: string;
    date: string;
    number: string;
    type: string;
    party: string;
    qtyIn: number;
    qtyOut: number;
    rate: number;
    amount: number;
    balance: number;
  }[];
  closing: number;
  closingValue: number;
  totals: { qtyIn: number; qtyOut: number };
};

const TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
  sales: "Sale",
  purchase_return: "Purchase return",
  sales_return: "Sale return",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

/** Item-wise stock card: pick an item (and optionally a campus / dates) to see every movement. */
export function StockLedger({
  items,
  branches,
  branch: defaultBranch,
  onOpenVoucher,
}: {
  items: ItemOption[];
  branches: Branch[];
  branch: string;
  onOpenVoucher?: (id: string) => void;
}) {
  const [itemId, setItemId] = useState("");
  const [branch, setBranch] = useState(defaultBranch);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<LedgerData | null>(null);
  const [error, setError] = useState("");

  const query = () => {
    const p = new URLSearchParams({ item: itemId });
    if (branch) p.set("branch", branch);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  };

  useEffect(() => {
    if (!itemId) return;
    let live = true;
    fetch(`/api/inventory?view=stock-ledger&${query()}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) {
          setError(d.error);
          setData(null);
        } else {
          setError("");
          setData(d);
        }
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, branch, from, to]);

  const q = search.trim().toLowerCase();
  const shown = q ? items.filter((i) => `${i.name} ${i.sku}`.toLowerCase().includes(q)) : items;

  return (
    <Panel title="Stock Ledger" meta={data ? `${data.item.sku} · ${data.item.name}` : "SELECT ITEM"}>
      <div className="chips no-print" style={{ marginBottom: 14, alignItems: "center" }}>
        <input
          className={inputClass}
          style={{ maxWidth: 200 }}
          placeholder="Search item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputClass} style={{ maxWidth: 300 }} value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">Choose an item…</option>
          {shown.map((i) => (
            <option key={i._id} value={i._id}>
              {i.name} ({i.sku})
            </option>
          ))}
        </select>
        <select className={inputClass} style={{ maxWidth: 200 }} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All campuses</option>
          {branches.map((b) => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>
        <input type="date" className={inputClass} style={{ maxWidth: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
        <input type="date" className={inputClass} style={{ maxWidth: 160 }} value={to} onChange={(e) => setTo(e.target.value)} title="To" />
        {itemId ? (
          <button type="button" className="btn-dark" onClick={() => window.open(`/print/stock-ledger?${query()}`, "_blank")}>
            Print stock ledger
          </button>
        ) : null}
      </div>

      {error ? <div className="alert err">{error}</div> : null}
      {!itemId || !data ? (
        <EmptyState message="Choose an item to see every purchase, sale, return, transfer and adjustment with the running balance." />
      ) : (
        <div className="table-scroll">
          <table className="reg report-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Party / campus</th>
                <th className="right">In</th>
                <th className="right">Out</th>
                <th className="right">Rate</th>
                <th className="right">Amount</th>
                <th className="right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={7}><strong>Opening stock</strong></td>
                <td className="num"><strong>{data.opening} {data.item.unit}</strong></td>
              </tr>
              {data.rows.map((r, i) => (
                <tr
                  key={`${r.voucherId}-${i}`}
                  style={onOpenVoucher ? { cursor: "pointer" } : undefined}
                  onClick={() => onOpenVoucher?.(r.voucherId)}
                >
                  <td>{prettyDate(r.date)}</td>
                  <td>
                    <div className="num">{r.number}</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{TYPE_LABEL[r.type] || r.type}</div>
                  </td>
                  <td>{r.party || "—"}</td>
                  <td className="num">{r.qtyIn || ""}</td>
                  <td className="num">{r.qtyOut || ""}</td>
                  <td className="num">{formatNumber(r.rate)}</td>
                  <td className="num">{formatNumber(r.amount)}</td>
                  <td className="num">{r.balance}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td colSpan={3}><strong>CLOSING</strong></td>
                <td className="num"><strong>{data.totals.qtyIn}</strong></td>
                <td className="num"><strong>{data.totals.qtyOut}</strong></td>
                <td colSpan={2} className="num"><strong>Value {formatNumber(data.closingValue)}</strong></td>
                <td className="num"><strong>{data.closing} {data.item.unit}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
