"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState, Field, Hero, ModalForm, NameCell, Panel, StatusBadge, inputClass } from "@/components/ui";
import { TeacherItem, formatNumber, fullName, prettyDate, toDateInput } from "@/lib/types";

type Leave = {
  _id: string;
  teacherId: TeacherItem | string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason?: string;
  status: string;
};

type Payslip = {
  _id: string;
  teacherId: TeacherItem | string;
  month: string;
  basic: number;
  allowances: number;
  deductions: number;
  net: number;
  status: string;
};

export default function HrPage() {
  const [tab, setTab] = useState<"payroll" | "leave">("payroll");
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [payroll, setPayroll] = useState({ paid: 0, pending: 0, draft: 0, total: 0 });
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    teacherId: "",
    leaveType: "casual",
    fromDate: toDateInput(new Date()),
    toDate: toDateInput(new Date()),
    days: 1,
    reason: "",
    status: "pending",
  });
  const [payForm, setPayForm] = useState({
    teacherId: "",
    month: new Date().toISOString().slice(0, 7),
    basic: 50000,
    allowances: 0,
    deductions: 0,
    status: "pending",
    notes: "",
  });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [hr, t] = await Promise.all([
      fetch("/api/hr").then((r) => r.json()),
      fetch("/api/teachers").then((r) => r.json()),
    ]);
    setLeaves(hr.leaves || []);
    setPayslips(hr.payslips || []);
    setPayroll(hr.payroll || { paid: 0, pending: 0, draft: 0, total: 0 });
    setTeachers(t.teachers || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createLeave(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/hr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(leaveForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setLeaveOpen(false);
    load();
  }

  async function createPayslip(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/hr/payslips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Failed");
      return;
    }
    setPayOpen(false);
    load();
  }

  async function setLeaveStatus(id: string, status: string) {
    await fetch(`/api/hr/leave/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function markPaid(p: Payslip) {
    const teacherId = typeof p.teacherId === "object" ? p.teacherId._id : p.teacherId;
    await fetch(`/api/hr/payslips/${p._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherId,
        month: p.month,
        basic: p.basic,
        allowances: p.allowances,
        deductions: p.deductions,
        status: "paid",
        paidOn: toDateInput(new Date()),
      }),
    });
    load();
  }

  return (
    <>
      <Hero
        title="HR & Payroll"
        subtitle="Staff leave, salaries and payslips"
        actionLabel={tab === "payroll" ? "Create Payslip" : "Add Leave"}
        onAction={() => (tab === "payroll" ? setPayOpen(true) : setLeaveOpen(true))}
      />

      <div className="pay-stat-row">
        <div className="pay-stat"><div className="tag">Payroll Total</div><div className="num">PKR {formatNumber(payroll.total)}</div></div>
        <div className="pay-stat"><div className="tag">Paid</div><div className="num" style={{ color: "var(--jade-dark)" }}>PKR {formatNumber(payroll.paid)}</div></div>
        <div className="pay-stat"><div className="tag">Pending</div><div className="num" style={{ color: "#96650f" }}>PKR {formatNumber(payroll.pending)}</div></div>
      </div>

      <div className="tabs">
        <button type="button" className={`tab${tab === "payroll" ? " active" : ""}`} onClick={() => setTab("payroll")}>Payroll</button>
        <button type="button" className={`tab${tab === "leave" ? " active" : ""}`} onClick={() => setTab("leave")}>Leave Requests</button>
      </div>

      {tab === "payroll" ? (
        <Panel title="Payslips" meta={`${payslips.length} RECORDS`}>
          {!payslips.length ? (
            <EmptyState message="No payslips yet. Create one for a staff member." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Month</th>
                    <th className="right">Basic</th>
                    <th className="right">Net</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => {
                    const t = typeof p.teacherId === "object" ? p.teacherId : null;
                    return (
                      <tr key={p._id}>
                        <td><NameCell name={t ? fullName(t) : "—"} /></td>
                        <td className="num">{p.month}</td>
                        <td className="num">{formatNumber(p.basic)}</td>
                        <td className="num">{formatNumber(p.net)}</td>
                        <td className="right"><StatusBadge status={p.status === "paid" ? "paid" : "pending"} /></td>
                        <td>
                          <div className="row-actions">
                            {p.status !== "paid" ? (
                              <button type="button" className="link-btn" onClick={() => markPaid(p)}>Mark Paid</button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Leave Requests" meta={`${leaves.length} RECORDS`}>
          {!leaves.length ? (
            <EmptyState message="No leave requests." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Type</th>
                    <th>From → To</th>
                    <th className="right">Days</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l) => {
                    const t = typeof l.teacherId === "object" ? l.teacherId : null;
                    return (
                      <tr key={l._id}>
                        <td><NameCell name={t ? fullName(t) : "—"} /></td>
                        <td style={{ textTransform: "capitalize" }}>{l.leaveType}</td>
                        <td>{prettyDate(l.fromDate)} → {prettyDate(l.toDate)}</td>
                        <td className="num">{l.days}</td>
                        <td className="right"><StatusBadge status={l.status === "approved" ? "active" : l.status === "rejected" ? "overdue" : "pending"} /></td>
                        <td>
                          <div className="row-actions">
                            {l.status === "pending" ? (
                              <>
                                <button type="button" className="link-btn" onClick={() => setLeaveStatus(l._id, "approved")}>Approve</button>
                                <button type="button" className="link-btn danger" onClick={() => setLeaveStatus(l._id, "rejected")}>Reject</button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <ModalForm open={leaveOpen} onClose={() => setLeaveOpen(false)} onSubmit={createLeave} title="Add Leave Request" submitLabel="Submit">
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Staff" required>
            <select className={inputClass} value={leaveForm.teacherId} onChange={(e) => setLeaveForm({ ...leaveForm, teacherId: e.target.value })} required>
              <option value="">Select</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>{fullName(t)}</option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select className={inputClass} value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
              <option value="casual">Casual</option>
              <option value="sick">Sick</option>
              <option value="annual">Annual</option>
              <option value="unpaid">Unpaid</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="From">
            <input type="date" className={inputClass} value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className={inputClass} value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} />
          </Field>
          <Field label="Days">
            <input type="number" className={inputClass} value={leaveForm.days} onChange={(e) => setLeaveForm({ ...leaveForm, days: Number(e.target.value) })} />
          </Field>
          <Field label="Reason">
            <input className={inputClass} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} />
          </Field>
        </div>
      </ModalForm>

      <ModalForm open={payOpen} onClose={() => setPayOpen(false)} onSubmit={createPayslip} title="Create Payslip" submitLabel="Create">
        {err ? <div className="alert err">{err}</div> : null}
        <div className="form-grid">
          <Field label="Staff" required>
            <select className={inputClass} value={payForm.teacherId} onChange={(e) => setPayForm({ ...payForm, teacherId: e.target.value })} required>
              <option value="">Select</option>
              {teachers.map((t) => (
                <option key={t._id} value={t._id}>{fullName(t)}</option>
              ))}
            </select>
          </Field>
          <Field label="Month (YYYY-MM)" required>
            <input className={inputClass} value={payForm.month} onChange={(e) => setPayForm({ ...payForm, month: e.target.value })} required />
          </Field>
          <Field label="Basic">
            <input type="number" className={inputClass} value={payForm.basic} onChange={(e) => setPayForm({ ...payForm, basic: Number(e.target.value) })} />
          </Field>
          <Field label="Allowances">
            <input type="number" className={inputClass} value={payForm.allowances} onChange={(e) => setPayForm({ ...payForm, allowances: Number(e.target.value) })} />
          </Field>
          <Field label="Deductions">
            <input type="number" className={inputClass} value={payForm.deductions} onChange={(e) => setPayForm({ ...payForm, deductions: Number(e.target.value) })} />
          </Field>
          <Field label="Status">
            <select className={inputClass} value={payForm.status} onChange={(e) => setPayForm({ ...payForm, status: e.target.value })}>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
        </div>
      </ModalForm>
    </>
  );
}
