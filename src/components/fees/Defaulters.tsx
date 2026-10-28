"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, NameCell, Panel, inputClass } from "@/components/ui";
import { formatNumber, photoSrc, prettyDate } from "@/lib/types";

type Row = {
  studentId: string;
  name: string;
  admissionNo: string;
  classLabel: string;
  parentName: string;
  phone: string;
  photoUpdatedAt: string | null;
  months: { label: string; feeId: string; due: number }[];
  monthCount: number;
  due: number;
  oldestDue: string;
  daysLate: number;
  latestFeeId: string;
};

type Data = { currency: string; rows: Row[]; total: number; count: number; threePlus: number; noPhone: number };

/**
 * Students with unpaid fee, one row each, with one-click WhatsApp reminders (heads, totals and
 * the challan link) and challan printing — for one student or every one picked.
 */
export function Defaulters({ bare = false }: { bare?: boolean }) {
  const [classes, setClasses] = useState<{ _id: string; name: string; section: string }[]>([]);
  const [f, setF] = useState({ classId: "", minMonths: "1", overdue: false });
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sent, setSent] = useState<Set<string>>(new Set());
  const qs = new URLSearchParams({ ...(f.classId ? { classId: f.classId } : {}), minMonths: f.minMonths, ...(f.overdue ? { overdue: "1" } : {}) }).toString();

  useEffect(() => {
    fetch("/api/classes")
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`/api/fees/defaulters?${qs}`)
      .then(async (r) => {
        const d = await r.json();
        if (!live) return;
        if (!r.ok) throw new Error(d.error || "Could not load");
        setErr("");
        setData(d);
        setPicked(new Set());
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [qs]);

  const cur = data?.currency || "";
  const withPhone = useMemo(() => (data?.rows || []).filter((r) => r.phone), [data]);
  const pickedRows = (data?.rows || []).filter((r) => picked.has(r.studentId));

  /** Opens WhatsApp with this parent's reminder (heads, totals, challan link) and logs it. */
  async function remind(r: Row) {
    const tab = window.open("about:blank", "_blank");
    try {
      const body = { kind: "fee", feeScope: "unpaid", onlyStudents: [r.studentId] };
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", ...body }),
      });
      const d = await res.json();
      const link = d.rows?.[0]?.waLink;
      if (!res.ok || !link) throw new Error(d.error || "No phone number saved for this parent");
      if (tab) tab.location.href = link;
      else window.open(link, "_blank");
      setSent((s) => new Set(s).add(r.studentId));
      fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", ...body, studentIds: [r.studentId], manual: true }),
      }).catch(() => {});
    } catch (e) {
      tab?.close();
      alert((e as Error).message);
    }
  }

  function toggle(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const body = (
    <>
      <div className="coll-filters no-print">
        <select className={inputClass} value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>
          <option value="">All classes</option>
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
        <select className={inputClass} value={f.minMonths} onChange={(e) => setF({ ...f, minMonths: e.target.value })}>
          <option value="1">1 month or more unpaid</option>
          <option value="2">2 months or more</option>
          <option value="3">3 months or more</option>
        </select>
        <label className="ec-check">
          <input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} />
          Past due date only
        </label>
      </div>

      {err ? <div className="alert err">{err}</div> : null}
      {data ? (
        <>
          <div className="pay-stat-row">
            <div className="pay-stat"><div className="tag">Students with dues</div><div className="num">{data.count}</div></div>
            <div className="pay-stat"><div className="tag">Total outstanding</div><div className="num" style={{ color: "var(--red)" }}>{cur} {formatNumber(data.total)}</div></div>
            <div className="pay-stat"><div className="tag">3+ months unpaid</div><div className="num">{data.threePlus}</div></div>
            <div className="pay-stat"><div className="tag">No parent phone</div><div className="num">{data.noPhone}</div></div>
          </div>

          {!data.rows.length ? (
            <EmptyState message="No unpaid fee for this selection." />
          ) : (
            <>
              <div className="def-bulk no-print">
                <button type="button" className="btn-ghost" onClick={() => setPicked(new Set(withPhone.map((r) => r.studentId)))}>
                  Select all with phone ({withPhone.length})
                </button>
                {picked.size ? <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>Clear</button> : null}
                <span>{picked.size} selected</span>
                <a
                  className={`btn-dark${picked.size ? "" : " disabled"}`}
                  href={picked.size ? `/print/fee-challans?ids=${pickedRows.map((r) => r.latestFeeId).join(",")}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Print their challans
                </a>
                <a
                  className={`wa-btn${picked.size ? "" : " disabled"}`}
                  href={picked.size ? `/messages?kind=fee&students=${[...picked].join(",")}` : undefined}
                >
                  Send reminders on WhatsApp
                </a>
              </div>
              <div className="table-scroll">
                <table className="reg">
                  <thead>
                    <tr>
                      <th className="no-print" />
                      <th>Student</th>
                      <th>Class</th>
                      <th>Father / phone</th>
                      <th>Unpaid months</th>
                      <th>Oldest due</th>
                      <th className="right">Amount due</th>
                      <th className="right no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.studentId} className={r.monthCount >= 3 ? "def-hot" : ""}>
                        <td className="no-print">
                          <input type="checkbox" checked={picked.has(r.studentId)} onChange={() => toggle(r.studentId)} />
                        </td>
                        <td>
                          <NameCell
                            name={r.name}
                            sub={r.admissionNo}
                            photo={photoSrc("student", { _id: r.studentId, photoUpdatedAt: r.photoUpdatedAt || undefined })}
                            href={`/students/${r.studentId}`}
                          />
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{r.classLabel}</td>
                        <td>
                          {r.parentName || "—"}
                          <div className="cell-sub">{r.phone || "No phone saved"}</div>
                        </td>
                        <td>
                          <div className="def-months">
                            {r.months.map((m) => <span key={m.feeId}>{m.label.replace("Monthly Fee · ", "")}</span>)}
                          </div>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {prettyDate(r.oldestDue)}
                          <div className="cell-sub">{r.daysLate ? `${r.daysLate} days late` : "not yet due"}</div>
                        </td>
                        <td className="num"><b>{formatNumber(r.due)}</b></td>
                        <td className="no-print">
                          <div className="row-actions">
                            <a className="link-btn" href={`/print/fee-challans?ids=${r.latestFeeId}`} target="_blank" rel="noreferrer">Challan</a>
                            {r.phone ? (
                              <button type="button" className="wa-btn" onClick={() => remind(r)}>
                                {sent.has(r.studentId) ? "Sent ✓" : "WhatsApp"}
                              </button>
                            ) : (
                              <Link className="link-btn" href={`/students/${r.studentId}`}>Add phone</Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="no-print" />
                      <td colSpan={5}><b>Total ({data.count} students)</b></td>
                      <td className="num"><b>{cur} {formatNumber(data.total)}</b></td>
                      <td className="no-print" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </>
      ) : null}
    </>
  );
  // Inside another panel (Reports) the list is shown bare.
  return bare ? body : <Panel title="Fee Defaulters" meta={data ? `${data.count} STUDENTS` : ""}>{body}</Panel>;
}
