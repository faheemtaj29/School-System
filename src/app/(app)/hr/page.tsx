"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SalaryTaxSettings } from "@/components/hr/SalaryTaxSettings";
import { DEDUCTION_HEADS, EARNING_HEADS, SalaryLines, cleanLines, lineTotal, type PayLine } from "@/components/hr/SalaryLines";
import { useSchoolProfile } from "@/lib/useSchoolProfile";
import { EmptyState, Field, Hero, ModalForm, NameCell, Panel, StatusBadge, inputClass } from "@/components/ui";
import { TeacherItem, formatNumber, fullName, prettyDate, toDateInput, photoSrc } from "@/lib/types";

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

/** Someone on the payroll: a teacher or a campus staff member. */
type Employee = Pick<TeacherItem, "_id" | "firstName" | "lastName" | "basicSalary" | "allowances" | "salaryHeads" | "paymentMethod" | "bankAccount"> & {
  employeeId?: string;
  designation?: string;
  photoUpdatedAt?: string;
  model: "Teacher" | "Staff";
};

type Payslip = {
  _id: string;
  teacherId: (TeacherItem & { designation?: string }) | string;
  employeeModel?: "Teacher" | "Staff";
  /** The salary journal posted when the payslip was paid. */
  voucher?: { number: string; id: string } | null;
  month: string;
  basic: number;
  allowances: number;
  exemptAllowance?: number;
  taxableIncome?: number;
  incomeTax?: number;
  deductions: number;
  earnings?: { head: string; amount: number }[];
  deductionItems?: { head: string; amount: number }[];
  workingDays?: number;
  unpaidDays?: number;
  paymentMethod?: "bank" | "cash";
  net: number;
  status: string;
};

const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return y && m ? new Date(y, m, 0).getDate() : 30;
};

/** Salary lines from a staff member's structure; older records show their allowance total as one line. */
function structureOf(t: Employee | undefined) {
  const heads = t?.salaryHeads || [];
  const pick = (kind: "earning" | "deduction") => heads.filter((h) => h.kind === kind).map(({ head, amount }) => ({ head, amount }));
  return {
    earnings: heads.length ? pick("earning") : t?.allowances ? [{ head: "Allowances", amount: t.allowances }] : [],
    deductionItems: pick("deduction"),
  };
}

export default function HrPage() {
  const { currency: cur } = useSchoolProfile();
  const [tab, setTab] = useState<"payroll" | "leave" | "tax">("payroll");
  const [teachers, setTeachers] = useState<TeacherItem[]>([]);
  const [campusStaff, setCampusStaff] = useState<Employee[]>([]);
  const employees: Employee[] = useMemo(
    () => [...teachers.map((t) => ({ ...t, model: "Teacher" as const })), ...campusStaff],
    [teachers, campusStaff]
  );
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
    employeeModel: "Teacher" as "Teacher" | "Staff",
    month: new Date().toISOString().slice(0, 7),
    basic: 50000,
    earnings: [] as PayLine[],
    deductionItems: [] as PayLine[],
    workingDays: daysIn(new Date().toISOString().slice(0, 7)),
    unpaidDays: 0,
    paymentMethod: "bank" as "bank" | "cash",
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
      const [teacherResponse, staffResponse] = await Promise.all([fetch("/api/teachers"), fetch("/api/staff")]);
      const [teacherData, staffData] = await Promise.all([teacherResponse.json(), staffResponse.json()]);
      setTeachers(teacherResponse.ok ? teacherData.teachers || [] : []);
      setCampusStaff(
        staffResponse.ok
          ? (staffData.staff || []).filter((s: { status?: string }) => s.status !== "inactive").map((s: Omit<Employee, "model">) => ({ ...s, model: "Staff" as const }))
          : []
      );
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
        earnings: cleanLines(payForm.earnings),
        deductionItems: cleanLines(payForm.deductionItems),
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
        employeeModel: p.employeeModel || "Teacher",
        month: p.month,
        basic: p.basic,
        allowances: p.allowances,
        deductions: p.deductions,
        earnings: p.earnings,
        deductionItems: p.deductionItems,
        workingDays: p.workingDays,
        unpaidDays: p.unpaidDays,
        paymentMethod: p.paymentMethod,
        exemptAllowance: p.exemptAllowance ?? undefined,
        incomeTax: p.incomeTax ?? undefined,
        status: "paid",
        paidOn: toDateInput(new Date()),
      }),
    });
    load();
  }

  function printPayslip(p: Payslip) {
    window.open(`/print/payslip?id=${p._id}`, "_blank");
  }

  const [genMonth, setGenMonth] = useState(new Date().toISOString().slice(0, 7));
  const [genBusy, setGenBusy] = useState(false);
  const [genMsg, setGenMsg] = useState("");
  async function generatePayroll() {
    setGenBusy(true);
    setGenMsg("");
    setErr("");
    try {
      const res = await fetch("/api/hr/payslips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: genMonth }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not generate payroll");
      const failed = (d.failed || []).map((x: { name: string; error: string }) => `${x.name}: ${x.error}`).join("; ");
      setGenMsg(
        `${d.created} payslip${d.created === 1 ? "" : "s"} made for ${genMonth}` +
          (d.skipped ? ` · ${d.skipped} already had one` : "") +
          (failed ? ` · Not made — ${failed}` : "") +
          (!d.created && !d.skipped && !failed ? " · No active staff with a basic salary set." : "")
      );
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenBusy(false);
    }
  }

  const payGross = payForm.basic + lineTotal(payForm.earnings);
  const absentCut =
    payForm.workingDays > 0 && payForm.unpaidDays > 0
      ? Math.round((payForm.basic / payForm.workingDays) * Math.min(payForm.unpaidDays, payForm.workingDays) * 100) / 100
      : 0;
  const payDeductions = lineTotal(payForm.deductionItems) + absentCut;

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

      {tab === "payroll" && portal === "admin" ? (
        <div className="period-bar no-print">
          <label>
            <span>Payroll month</span>
            <input type="month" className={inputClass} value={genMonth} onChange={(e) => setGenMonth(e.target.value)} />
          </label>
          <button type="button" className="btn-primary" disabled={genBusy} onClick={generatePayroll}>
            {genBusy ? "Generating…" : "Generate payslips for all staff"}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Teachers and campus staff with a basic salary, from their salary structure; approved unpaid leave is deducted. Anyone who already has a payslip is skipped.
          </span>
        </div>
      ) : null}
      {genMsg ? <div className="alert ok no-print">{genMsg}</div> : null}

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
                    <th>Voucher</th>
                    <th className="right">Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => {
                    const t = typeof p.teacherId === "object" ? p.teacherId : null;
                    const isStaff = p.employeeModel === "Staff";
                    return (
                      <tr key={p._id}>
                        <td>
                          {t ? (
                            <Link href={portal === "teacher" ? "/teachers/me" : isStaff ? "/staff" : `/teachers/${t._id}`} className="name-link">
                              <NameCell name={fullName(t)} sub={t.designation || (isStaff ? "Campus staff" : "Teacher")} photo={photoSrc(isStaff ? "staff" : "teacher", t)} />
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="num">{p.month}</td>
                        <td className="num">{formatNumber(p.basic + p.allowances)}</td>
                        <td className="num">{formatNumber(p.incomeTax || 0)}</td>
                        <td className="num">{formatNumber(p.net)}</td>
                        <td>
                          {p.voucher ? (
                            <a className="link-btn mono" href={`/print/voucher?id=${p.voucher.id}`} target="_blank" rel="noreferrer" title="Salary journal in the chart of accounts">
                              {p.voucher.number}
                            </a>
                          ) : (
                            <span className="cell-sub">On payment</span>
                          )}
                        </td>
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
                        <td><NameCell name={t ? fullName(t) : "—"} photo={t ? photoSrc("teacher", t) : null} /></td>
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
                const picked = employees.find((t) => t._id === e.target.value);
                setPayForm({
                  ...payForm,
                  teacherId: e.target.value,
                  employeeModel: picked?.model || "Teacher",
                  basic: picked?.basicSalary ?? payForm.basic,
                  ...structureOf(picked),
                  paymentMethod: picked?.paymentMethod === "cash" || (picked && !picked.paymentMethod && !picked.bankAccount) ? "cash" : "bank",
                });
              }}
              required
            >
              <option value="">Select</option>
              <optgroup label="Teachers">
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>{fullName(t)}{t.employeeId ? ` · ${t.employeeId}` : ""}</option>
                ))}
              </optgroup>
              {campusStaff.length ? (
                <optgroup label="Campus staff">
                  {campusStaff.map((t) => (
                    <option key={t._id} value={t._id}>{fullName(t)} · {t.designation || "Staff"}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </Field>
          <Field label="Month" required>
            <input
              type="month"
              className={inputClass}
              value={payForm.month}
              onChange={(e) => setPayForm({ ...payForm, month: e.target.value, workingDays: daysIn(e.target.value) })}
              required
            />
          </Field>
          <Field label="Basic salary">
            <input type="number" min={0} className={inputClass} value={payForm.basic} onChange={(e) => setPayForm({ ...payForm, basic: Number(e.target.value) })} />
          </Field>
          <Field label="Paid by">
            <select className={inputClass} value={payForm.paymentMethod} onChange={(e) => setPayForm({ ...payForm, paymentMethod: e.target.value as "bank" | "cash" })}>
              <option value="bank">Bank transfer</option>
              <option value="cash">Cash</option>
            </select>
          </Field>
          <Field label="Days in pay period">
            <input type="number" min={0} max={31} className={inputClass} value={payForm.workingDays} onChange={(e) => setPayForm({ ...payForm, workingDays: Number(e.target.value) })} />
          </Field>
          <Field label="Unpaid days (absent / unpaid leave)">
            <input type="number" min={0} max={31} step="0.5" className={inputClass} value={payForm.unpaidDays} onChange={(e) => setPayForm({ ...payForm, unpaidDays: Number(e.target.value) })} />
          </Field>
          <Field label="Tax-free allowance (empty = automatic)">
            <input type="number" min={0} className={inputClass} placeholder="auto" value={payForm.exemptAllowance} onChange={(e) => setPayForm({ ...payForm, exemptAllowance: e.target.value })} />
          </Field>
          <Field label="Income tax (empty = from tax slabs)">
            <input type="number" min={0} className={inputClass} placeholder="auto" value={payForm.incomeTax} onChange={(e) => setPayForm({ ...payForm, incomeTax: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className={inputClass} value={payForm.status} onChange={(e) => setPayForm({ ...payForm, status: e.target.value })}>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="paid">Paid</option>
            </select>
          </Field>
        </div>
        <div className="pay-lines-grid">
          <SalaryLines title="Allowances" currency={cur} lines={payForm.earnings} onChange={(earnings) => setPayForm({ ...payForm, earnings })} suggestions={EARNING_HEADS} />
          <SalaryLines
            title="Deductions"
            currency={cur}
            lines={payForm.deductionItems}
            onChange={(deductionItems) => setPayForm({ ...payForm, deductionItems })}
            suggestions={DEDUCTION_HEADS}
          />
        </div>
        <div className="pay-preview">
          <span>Gross <b>{formatNumber(payGross)}</b></span>
          {absentCut ? <span>Unpaid days <b>− {formatNumber(absentCut)}</b></span> : null}
          <span>Deductions <b>− {formatNumber(payDeductions)}</b></span>
          <span>Before tax <b>{formatNumber(payGross - payDeductions)}</b></span>
          <span style={{ color: "var(--text-dim)" }}>
            {payForm.incomeTax === "" ? "Income tax is worked out on saving." : `Income tax − ${formatNumber(Number(payForm.incomeTax) || 0)}`}
          </span>
        </div>
      </ModalForm>
    </>
  );
}
