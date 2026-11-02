"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, Panel, StatusBadge, inputClass } from "@/components/ui";
import { prettyDate, toDateInput } from "@/lib/types";

type Leave = {
  _id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
};

export function StudentLeaveRequests({ studentId, canRequest }: { studentId: string; canRequest: boolean }) {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveType, setLeaveType] = useState("casual");
  const [fromDate, setFromDate] = useState(toDateInput(new Date()));
  const [toDate, setToDate] = useState(toDateInput(new Date()));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/student-leaves?studentId=${encodeURIComponent(studentId)}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not load leave requests.");
        return;
      }
      setLeaves(data.leaves || []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load leave requests.");
    }
  }, [studentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load fetches before updating request state
    load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/student-leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, leaveType, fromDate, toDate, reason }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Could not submit the leave request.");
        return;
      }
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the leave request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Leave requests" meta={`${leaves.length} REQUESTS`}>
      {canRequest ? (
        <form className="stack no-print" onSubmit={submit}>
          <div className="form-grid">
            <label>
              <span>Leave type</span>
              <select className={inputClass} value={leaveType} onChange={(event) => setLeaveType(event.target.value)}>
                <option value="casual">Casual</option>
                <option value="sick">Sick</option>
                <option value="annual">Annual</option>
                <option value="unpaid">Unpaid</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label><span>From</span><input type="date" className={inputClass} value={fromDate} onChange={(event) => setFromDate(event.target.value)} required /></label>
            <label><span>To</span><input type="date" className={inputClass} value={toDate} onChange={(event) => setToDate(event.target.value)} min={fromDate} required /></label>
            <label><span>Reason</span><input className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} /></label>
          </div>
          {error ? <div className="alert err">{error}</div> : null}
          <div className="form-actions"><button type="submit" className="btn-dark" disabled={busy}>{busy ? "Submitting…" : "Submit leave request"}</button></div>
        </form>
      ) : null}
      {!canRequest && error ? <div className="alert err">{error}</div> : null}
      {!leaves.length ? (
        <EmptyState message="No leave requests recorded." />
      ) : (
        <div className="table-scroll">
          <table className="reg">
            <thead><tr><th>Type</th><th>From → To</th><th className="right">Days</th><th>Reason</th><th className="right">Status</th></tr></thead>
            <tbody>{leaves.map((leave) => (
              <tr key={leave._id}>
                <td style={{ textTransform: "capitalize" }}>{leave.leaveType}</td>
                <td>{prettyDate(leave.fromDate)} → {prettyDate(leave.toDate)}</td>
                <td className="num">{leave.days}</td>
                <td>{leave.reason || "—"}</td>
                <td className="right"><StatusBadge status={leave.status} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
