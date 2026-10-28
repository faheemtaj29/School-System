"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState, Panel, inputClass } from "@/components/ui";
import { formatNumber, prettyDate } from "@/lib/types";

export type CollectionReport = {
  from: string;
  to: string;
  total: number;
  rows: {
    date: string; receiptNo: string; feeId: string; student: string; admissionNo: string; classLabel: string;
    title: string; method: string; amount: number; receivedBy: string;
  }[];
  byMethod: { label: string; count: number; amount: number }[];
  byDay: { label: string; count: number; amount: number }[];
  byClass: { label: string; count: number; amount: number }[];
  byHead: { label: string; amount: number }[];
  school: { currency: string };
};

export const METHOD_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", online: "Online", card: "Card" };

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

/** Fee collection report (daily cash closing) with filters; prints from /print/fee-collections. */
export function FeeCollections({ classes }: { classes: { _id: string; name: string; section: string }[] }) {
  const [f, setF] = useState({ from: today(), to: today(), method: "", classId: "" });
  const [data, setData] = useState<CollectionReport | null>(null);
  const [err, setErr] = useState("");
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

  useEffect(() => {
    let live = true;
    fetch(`/api/fees/collections?${qs}`)
      .then(async (r) => {
        const d = await r.json();
        if (!live) return;
        if (!r.ok) throw new Error(d.error || "Could not load");
        setErr("");
        setData(d);
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [qs]);

  const cur = data?.school.currency || "";
  const preset = (from: string, to: string) => setF({ ...f, from, to });

  return (
    <Panel title="Fee Collections" meta={data ? `${data.rows.length} RECEIPTS` : ""}>
      <div className="coll-filters no-print">
        <div className="chips">
          <button type="button" className={`filter-chip${f.from === today() && f.to === today() ? " active" : ""}`} onClick={() => preset(today(), today())}>Today</button>
          <button type="button" className={`filter-chip${f.from === monthStart() && f.to === today() ? " active" : ""}`} onClick={() => preset(monthStart(), today())}>This month</button>
        </div>
        <label>From <input type="date" className={inputClass} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>To <input type="date" className={inputClass} value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <select className={inputClass} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="">All methods</option>
          {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={inputClass} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
        <a className="btn-dark" href={`/print/fee-collections?${qs}`} target="_blank" rel="noreferrer">Print report</a>
      </div>

      {err ? <div className="alert err">{err}</div> : null}
      {data ? (
        <>
          <div className="pay-stat-row">
            <div className="pay-stat"><div className="tag">Total collected</div><div className="num" style={{ color: "var(--jade-dark)" }}>{cur} {formatNumber(data.total)}</div></div>
            {data.byMethod.map((m) => (
              <div className="pay-stat" key={m.label}>
                <div className="tag">{METHOD_LABEL[m.label] || m.label} · {m.count} receipt{m.count > 1 ? "s" : ""}</div>
                <div className="num">{cur} {formatNumber(m.amount)}</div>
              </div>
            ))}
          </div>
          {!data.rows.length ? (
            <EmptyState message="No fee received in this period." />
          ) : (
            <>
              <div className="coll-split">
                <div>
                  <h4>By fee head</h4>
                  <table className="reg compact">
                    <tbody>
                      {data.byHead.map((h) => <tr key={h.label}><td>{h.label}</td><td className="num">{formatNumber(h.amount)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4>By class</h4>
                  <table className="reg compact">
                    <tbody>
                      {data.byClass.map((c) => <tr key={c.label}><td>{c.label}</td><td className="num">{c.count}</td><td className="num">{formatNumber(c.amount)}</td></tr>)}
                    </tbody>
                  </table>
                </div>
                {data.byDay.length > 1 ? (
                  <div>
                    <h4>By day</h4>
                    <table className="reg compact">
                      <tbody>
                        {data.byDay.map((d) => <tr key={d.label}><td>{prettyDate(d.label)}</td><td className="num">{d.count}</td><td className="num">{formatNumber(d.amount)}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr><th>Date</th><th>Receipt</th><th>Student</th><th>Class</th><th>Challan</th><th>Method</th><th>Received by</th><th className="right">Amount</th></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.receiptNo + r.feeId}>
                        <td>{prettyDate(r.date)}</td>
                        <td className="num">
                          <Link href={`/print/fee-receipt?id=${r.feeId}&receiptNo=${encodeURIComponent(r.receiptNo)}`} target="_blank" className="name-link">{r.receiptNo}</Link>
                        </td>
                        <td>{r.student}<div className="cell-sub">{r.admissionNo}</div></td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.classLabel}</td>
                        <td>{r.title}</td>
                        <td>{METHOD_LABEL[r.method] || r.method}</td>
                        <td>{r.receivedBy || "—"}</td>
                        <td className="num">{formatNumber(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={7}><b>Total</b></td><td className="num"><b>{cur} {formatNumber(data.total)}</b></td></tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}
    </Panel>
  );
}
