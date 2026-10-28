"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SalaryTaxSettings } from "@/components/hr/SalaryTaxSettings";
import { useSchoolProfile } from "@/lib/useSchoolProfile";
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
  exemptAllowance?: number;
  taxableIncome?: number;
  incomeTax?: number;
  deductions: number;
  net: number;
  status: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] || char);
}

export default function HrPage() {
  const { currency: cur } = useSchoolProfile();
  const [tab, setTab] = useState<"payroll" | "leave" | "tax">("payroll");
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [payroll, setPayroll] = useState({ paid: 0, pending: 0, draft: 0, total: 0 });
  const [portal, setPortal] = useState<"admin" | "teacher" | null>(null);
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
    /** Empty = worked out from the tax rules. */
    exemptAllowance: "",
    incomeTax: "",
    status: "pending",
    notes: "",
  });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const hrResponse = await fetch("/api/hr");
    const hr = await hrResponse.json();
    if (!hrResponse.ok) {
      setErr(hr.error || "Unable to load HR records.");
      return;
    }
    const currentPortal = hr.portal === "teacher" ? "teacher" : "admin";
    setPortal(currentPortal);
    setLeaves(hr.leaves || []);
    setPayslips(hr.payslips || []);
    setPayroll(hr.payroll || { paid: 0, pending: 0, draft: 0, total: 0 });
    if (currentPortal === "admin") {
      const teacherResponse = await fetch("/api/teachers");
      const teacherData = await teacherResponse.json();
      if (teacherResponse.ok) setTeachers(teacherData.teachers || []);
      else setTeachers([]);
    } else {
      setTeachers([]);
    }
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
      body: JSON.stringify({
        ...payForm,
        exemptAllowance: payForm.exemptAllowance === "" ? undefined : Number(payForm.exemptAllowance),
        incomeTax: payForm.incomeTax === "" ? undefined : Number(payForm.incomeTax),
      }),
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
        exemptAllowance: p.exemptAllowance ?? undefined,
        incomeTax: p.incomeTax ?? undefined,
        status: "paid",
        paidOn: toDateInput(new Date()),
      }),
    });
    load();
  }

  function printPayslip(p: Payslip) {
    const teacher = typeof p.teacherId === "object" ? p.teacherId : null;
    const name = teacher ? fullName(teacher) : "Staff member";
    const net = Number(p.net) || 0;
    const basic = Number(p.basic) || 0;
    const allowances = Number(p.allowances) || 0;
    const deductions = Number(p.deductions) || 0;
    const tax = Number(p.incomeTax) || 0;
    const money = (n: number) => `${escapeHtml(cur)} ${n.toLocaleString("en-IN")}`;
    const printWindow = window.open("", "_blank", "width=800,height=700");
    if (!printWindow) {
      setErr("Please allow pop-ups to print or save the payslip as PDF.");
      return;
    }
    printWindow.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Salary Slip - ${escapeHtml(p.month)}</title>
<style>
body{font:14px Arial,sans-serif;color:#17212b;margin:40px}header{border-bottom:2px solid #17212b;padding-bottom:16px;margin-bottom:24px}h1{font-size:24px;margin:0 0 8px}p{margin:4px 0;color:#526170}.meta{display:flex;justify-content:space-between;margin:20px 0}.box{border:1px solid #d6dde5;border-radius:8px;padding:16px;margin:12px 0}table{width:100%;border-collapse:collapse;margin-top:20px}td{padding:12px;border-bottom:1px solid #e5e9ef}td:last-child{text-align:right;font-variant-numeric:tabular-nums}.net{font-size:18px;font-weight:bold}footer{margin-top:40px;color:#526170;font-size:12px}@media print{body{margin:15mm}}
</style></head><body>
<header><h1>Salary Slip</h1><p>Confidential employee payroll record</p></header>
<div class="meta"><div><strong>Employee</strong><br>${escapeHtml(name)}</div><div><strong>Pay period</strong><br>${escapeHtml(p.month)}</div><div><strong>Status</strong><br>${escapeHtml(p.status)}</div></div>
<table><tbody>
<tr><td>Basic salary</td><td>${money(basic)}</td></tr>
<tr><td>Allowances</td><td>${money(allowances)}</td></tr>
<tr><td>Gross salary</td><td>${money(basic + allowances)}</td></tr>
<tr><td>Taxable salary (after ${money(Number(p.exemptAllowance) || 0)} tax-free)</td><td>${money(Number(p.taxableIncome) || 0)}</td></tr>
<tr><td>Income tax deducted</td><td>${money(tax)}</td></tr>
<tr><td>Other deductions</td><td>${money(deductions)}</td></tr>
<tr class="net"><td>Net salary</td><td>${money(net)}</td></tr>
</tbody></table><footer>Generated from the School-System payroll records. Please contact HR if any detail needs correction.</footer>
<script>window.onload=()=>window.print();</script></body></html>`);
    printWindow.document.close();
  }

  const leaveStats = useMemo(() => ({
    pending:  leaves.filter((l) => l.status === "pending").length,
    approved: leaves.filter((l) => l.status === "approved").length,
    rejected: leaves.filter((l) => l.status === "rejected").length,
    totalDays: leaves.filter((l) => l.status === "approved").reduce((s, l) => s + l.days, 0),
  }), [leaves]);

  return (
    <>
      <Hero
        title="HR & Payroll"
        subtitle="Staff leave, salaries and payslips"
        actionLabel={tab === "payroll" ? (portal === "teacher" ? undefined : "Create Payslip") : tab === "leave" ? "Add Leave" : undefined}
        onAction={() => (tab === "payroll" ? (portal === "admin" ? setPayOpen(true) : undefined) : setLeaveOpen(true))}
      />

      {tab === "payroll" ? (
        <div className="pay-stat-row">
          <div className="pay-stat"><div className="tag">Payroll Total</div><div className="num">{cur} {formatNumber(payroll.total)}</div></div>
          <div className="pay-stat"><div className="tag">Paid</div><div className="num" style={{ color: "var(--jade-dark)" }}>{cur} {formatNumber(payroll.paid)}</div></div>
          <div className="pay-stat"><div className="tag">Pending</div><div className="num" style={{ color: "#96650f" }}>{cur} {formatNumber(payroll.pending)}</div></div>
          <div className="pay-stat"><div className="tag">Draft</div><div className="num">{payroll.draft}</div></div>
        </div>
      ) : tab === "leave" ? (
        <div className="pay-stat-row">
          <div className="pay-stat"><div className="tag">Pending</div><div className="num" style={{ color: "#96650f" }}>{leaveStats.pending}</div></div>
          <div className="pay-stat"><div className="tag">Approved</div><div className="num" style={{ color: "var(--jade-dark)" }}>{leaveStats.approved}</div></div>
          <div className="pay-stat"><div className="tag">Rejected</div><div className="num">{leaveStats.rejected}</div></div>
          <div className="pay-stat"><div className="tag">Approved Days</div><div className="num">{leaveStats.totalDays}</div></div>
        </div>
      ) : null}

      <div className="tabs">
        <button type="button" className={`tab${tab === "payroll" ? " active" : ""}`} onClick={() => setTab("payroll")}>Payroll</button>
        <button type="button" className={`tab${tab === "leave" ? " active" : ""}`} onClick={() => setTab("leave")}>Leave Requests</button>
        <button type="button" className={`tab${tab === "tax" ? " active" : ""}`} onClick={() => setTab("tax")}>Salary Tax</button>
      </div>

      {tab === "tax" ? <SalaryTaxSettings editable={portal === "admin"} /> : null}
      {tab === "payroll" && portal === "teacher" ? (
        <div className="alert ok no-print">
          Your full salary history and yearly tax certificate are on <Link href="/teachers/me">My Profile → Salary &amp; Tax</Link>.
        </div>
      ) : null}

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
                    <th className="right">Gross</th>
                    <th className="right">Income tax</th>
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
                        <td>
                          {t ? (
                            <Link href={portal === "teacher" ? "/teachers/me" : `/teachers/${t._id}`} className="name-link">
                              <NameCell name={fullName(t)} />
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="num">{p.month}</td>
                        <td className="num">{formatNumber(p.basic + p.allowances)}</td>
                        <td className="num">{formatNumber(p.incomeTax || 0)}</td>
                        <td className="num">{formatNumber(p.net)}</td>
                        <td className="right"><StatusBadge status={p.status === "paid" ? "paid" : "pending"} /></td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="link-btn" onClick={() => printPayslip(p)}>Print / Save PDF</button>
                            {portal === "admin" && p.status !== "paid" ? (
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
      ) : tab === "leave" ? (
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
                            {portal === "admin" && l.status === "pending" ? (
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
      ) : null}

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
            <select
              className={inputClass}
              value={payForm.teacherId}
              onChange={(e) => {
                const picked = teachers.find((t) => t._id === e.target.value);
                setPayForm({
                  ...payForm,
                  teacherId: e.target.value,
                  basic: picked?.basicSalary ?? payForm.basic,
                  allowances: picked?.allowances ?? payForm.allowances,
                });
              }}
              required
            >
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
          <Field label="Tax-free allowance (empty = automatic)">
            <input type="number" min={0} className={inputClass} placeholder="auto" value={payForm.exemptAllowance} onChange={(e) => setPayForm({ ...payForm, exemptAllowance: e.target.value })} />
          </Field>
          <Field label="Income tax (empty = from tax slabs)">
            <input type="number" min={0} className={inputClass} placeholder="auto" value={payForm.incomeTax} onChange={(e) => setPayForm({ ...payForm, incomeTax: e.target.value })} />
          </Field>
          <Field label="Other deductions">
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
