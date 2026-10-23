"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  NameCell,
  OptionSelect,
  Panel,
  StatusBadge,
  inputClass,
} from "@/components/ui";
import { FeeForm } from "@/components/forms/SchoolForms";
import {
  FeeItem,
  StudentItem,
  formatNumber,
  fullName,
  labelOfClass,
  prettyDate,
  toDateInput,
} from "@/lib/types";

type MainTab = "generate" | "received" | "pending" | "all";
type CoaAccount = { _id: string; code: string; name: string; type: string; level: number; isPosting: boolean };

export default function FeesPage() {
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<{ _id: string; name: string; section: string }[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [role, setRole] = useState("admin");
  const canEdit = role === "admin" || role === "staff";

  // Main tab
  const [tab, setTab] = useState<MainTab>("generate");

  // Fee builder state
  const [builderTarget, setBuilderTarget] = useState<"class" | "student">("class");
  const [builderClassId, setBuilderClassId] = useState("");
  const [builderStudentId, setBuilderStudentId] = useState("");
  const [builderDue, setBuilderDue] = useState(toDateInput(new Date()));
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderLines, setBuilderLines] = useState<{ head: string; amount: number; accountCode?: string }[]>([
    { head: "Tuition Fee", amount: 0 },
  ]);
  const [builderMsg, setBuilderMsg] = useState("");
  const [builderLoading, setBuilderLoading] = useState(false);

  // Received/Pending filters
  const [filterClass, setFilterClass] = useState("");
  const [feeSearch, setFeeSearch] = useState("");

  // Single voucher edit
  const [editOpen, setEditOpen] = useState(false);
  const [editFee, setEditFee] = useState<FeeItem | null>(null);

  // Quick-pay inline
  const [payingId, setPayingId] = useState("");
  const [payForm, setPayForm] = useState({ paidAmount: 0, method: "cash", paymentDate: toDateInput(new Date()) });
  const [payMsg, setPayMsg] = useState("");

  // Voucher print
  const [voucherId, setVoucherId] = useState("");

  // Late-fees msg
  const [sysMsg, setSysMsg] = useState("");

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({}));
    const myRole = me.user?.role || "admin";
    setRole(myRole);
    const f = await fetch("/api/fees").then((r) => r.json());
    setFees(f.fees || []);
    if (myRole === "admin" || myRole === "staff") {
      const [s, c, a] = await Promise.all([
        fetch("/api/students").then((r) => r.json()),
        fetch("/api/classes").then((r) => r.json()),
        fetch("/api/accounting?view=accounts").then((r) => r.json()).catch(() => ({})),
      ]);
      setStudents(s.students || []);
      setClasses(c.classes || []);
      setCoaAccounts((a.accounts || []).filter((ac: CoaAccount) => ac.isPosting));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const billed = fees.reduce((s, f) => s + f.amount, 0);
    const collected = fees.reduce((s, f) => s + f.paidAmount, 0);
    return {
      billed, collected,
      outstanding: Math.max(billed - collected, 0),
      paid: fees.filter((f) => f.status === "paid").length,
      pending: fees.filter((f) => f.status === "pending" || f.status === "overdue").length,
    };
  }, [fees]);

  // ── Builder helpers ─────────────────────────────────────────────────────
  const builderTotal = builderLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);

  function setLine(i: number, patch: Partial<{ head: string; amount: number; accountCode?: string }>) {
    setBuilderLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function applyFees(e: FormEvent) {
    e.preventDefault();
    setBuilderMsg("");
    setBuilderLoading(true);
    const lines = builderLines.filter((l) => l.head.trim() && l.amount > 0);
    if (!lines.length) { setBuilderMsg("Enter at least one fee head with amount."); setBuilderLoading(false); return; }

    try {
      if (builderTarget === "student") {
        if (!builderStudentId) { setBuilderMsg("Select a student."); setBuilderLoading(false); return; }
        const res = await fetch("/api/fees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: builderStudentId, dueDate: builderDue, title: builderTitle || undefined, lines, status: "pending", paidAmount: 0 }),
        });
        const data = await res.json();
        setBuilderMsg(res.ok ? `Voucher created for student.` : data.error || "Failed");
      } else {
        const res = await fetch("/api/fees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "bulk", classId: builderClassId || null, dueDate: builderDue, title: builderTitle || undefined, lines }),
        });
        const data = await res.json();
        if (res.ok) {
          const cls = classes.find((c) => c._id === builderClassId);
          setBuilderMsg(
            `${data.created} voucher(s) created${cls ? ` for ${cls.name}-${cls.section}` : " (all classes)"}` +
            ` · ${data.skipped} already billed · PKR ${formatNumber(data.billedAmount)} total` +
            (data.discountTotal ? ` · PKR ${formatNumber(data.discountTotal)} concessions` : "")
          );
        } else {
          setBuilderMsg(data.error || "Failed");
        }
      }
      load();
    } finally {
      setBuilderLoading(false);
    }
  }

  // ── Quick pay ───────────────────────────────────────────────────────────
  function startPay(fee: FeeItem) {
    setPayingId(fee._id);
    setPayForm({
      paidAmount: fee.amount - fee.paidAmount,
      method: "cash",
      paymentDate: toDateInput(new Date()),
    });
    setPayMsg("");
  }

  async function submitPay(fee: FeeItem) {
    const res = await fetch(`/api/fees/${fee._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: typeof fee.studentId === "object" ? (fee.studentId as { _id: string })._id : fee.studentId,
        dueDate: toDateInput(fee.dueDate),
        lines: fee.lines?.length ? fee.lines : [{ head: fee.title, amount: fee.amount }],
        status: "paid",
        paidAmount: payForm.paidAmount,
        paymentDate: payForm.paymentDate,
        method: payForm.method || undefined,
        notes: fee.notes,
      }),
    });
    const data = await res.json();
    if (res.ok) { setPayingId(""); load(); }
    else setPayMsg(data.error || "Failed");
  }

  // ── Filtered lists ──────────────────────────────────────────────────────
  function studentClass(fee: FeeItem): string {
    const s = typeof fee.studentId === "object" ? fee.studentId : null;
    if (!s) return "";
    const cls = s.classId;
    if (!cls) return "";
    return typeof cls === "object" ? (cls as { _id: string })._id : String(cls);
  }

  function feeStudentName(fee: FeeItem): string {
    const s = typeof fee.studentId === "object" ? fee.studentId : null;
    if (!s) return "";
    return `${fullName(s)} ${s.admissionNo || ""}`.toLowerCase();
  }

  const receivedFees = useMemo(() =>
    fees.filter((f) => f.status === "paid" &&
      (!filterClass || studentClass(f) === filterClass) &&
      (!feeSearch || feeStudentName(f).includes(feeSearch.toLowerCase()))),
    [fees, filterClass, feeSearch]);

  const pendingFees = useMemo(() =>
    fees.filter((f) => (f.status === "pending" || f.status === "overdue" || f.status === "partial") &&
      (!filterClass || studentClass(f) === filterClass) &&
      (!feeSearch || feeStudentName(f).includes(feeSearch.toLowerCase()))),
    [fees, filterClass, feeSearch]);

  const voucher = fees.find((f) => f._id === voucherId) ?? null;
  const voucherStudent = voucher && typeof voucher.studentId === "object" ? voucher.studentId : null;

  // ── Render helpers ──────────────────────────────────────────────────────
  function FeeRow({ fee, showPay }: { fee: FeeItem; showPay?: boolean }) {
    const s = typeof fee.studentId === "object" ? fee.studentId : null;
    const isPaying = payingId === fee._id;
    return (
      <>
        <tr key={fee._id} style={{ background: fee.status === "overdue" ? "var(--red-bg, #fff1f1)" : undefined }}>
          <td>
            <NameCell
              name={s ? fullName(s) : "Unknown"}
              sub={s ? `${s.admissionNo} · ${labelOfClass(s.classId as never)}` : undefined}
            />
          </td>
          <td>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{fee.title}</div>
            {fee.lines?.length ? (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {fee.lines.map((l) => `${l.head} PKR ${formatNumber(l.amount)}`).join(" · ")}
              </div>
            ) : null}
          </td>
          <td className="num">{prettyDate(fee.dueDate)}</td>
          <td className="num" style={{ fontWeight: 600 }}>PKR {formatNumber(fee.amount)}</td>
          <td className="num" style={{ color: fee.paidAmount > 0 ? "#16a34a" : "var(--text-dim)" }}>
            {fee.paidAmount > 0 ? `PKR ${formatNumber(fee.paidAmount)}` : "—"}
          </td>
          <td className="right">
            <StatusBadge status={fee.status} />
          </td>
          <td>
            <div className="row-actions">
              <button type="button" className="link-btn" onClick={() => setVoucherId(fee._id)}>Voucher</button>
              {canEdit ? (
                <>
                  {showPay && fee.status !== "paid" ? (
                    <button type="button" className="link-btn" onClick={() => startPay(fee)}>
                      {isPaying ? "Cancel" : "Mark Paid"}
                    </button>
                  ) : null}
                  <button type="button" className="link-btn" onClick={() => { setEditFee(fee); setEditOpen(true); }}>Edit</button>
                </>
              ) : null}
            </div>
          </td>
        </tr>
        {isPaying ? (
          <tr>
            <td colSpan={7} style={{ background: "var(--paper)", padding: "10px 16px" }}>
              {payMsg ? <div className="alert" style={{ marginBottom: 8 }}>{payMsg}</div> : null}
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>Amount Paid (PKR)</div>
                  <input
                    type="number" min={0} className={inputClass}
                    value={payForm.paidAmount}
                    onChange={(e) => setPayForm({ ...payForm, paidAmount: Number(e.target.value) })}
                    style={{ width: 120 }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>Method</div>
                  <select className={inputClass} value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} style={{ width: 110 }}>
                    <option value="cash">Cash</option>
                    <option value="bank">Bank</option>
                    <option value="online">Online</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 3 }}>Payment Date</div>
                  <input type="date" className={inputClass} value={payForm.paymentDate}
                    onChange={(e) => setPayForm({ ...payForm, paymentDate: e.target.value })} style={{ width: 140 }} />
                </div>
                <button type="button" className="btn-dark" onClick={() => submitPay(fee)} style={{ height: 36 }}>Confirm</button>
                <button type="button" className="btn-ghost" onClick={() => setPayingId("")} style={{ height: 36 }}>Cancel</button>
              </div>
            </td>
          </tr>
        ) : null}
      </>
    );
  }

  function ClassFilter() {
    return (
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="search"
          className={inputClass}
          placeholder="Search by student name or admission no…"
          value={feeSearch}
          onChange={(e) => setFeeSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select className={inputClass} value={filterClass} onChange={(e) => setFilterClass(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All Classes</option>
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </div>
    );
  }

  return (
    <>
      <Hero
        title="Fee Management"
        subtitle="Generate, collect and track student fees"
        actionLabel={canEdit ? "Single Voucher" : undefined}
        onAction={canEdit ? () => { setEditFee(null); setEditOpen(true); } : undefined}
      />

      {/* ── Stats bar ──────────────────────────────────────────────────── */}
      <Panel>
        <div className="pay-stat-row">
          <div className="pay-stat">
            <div className="tag">Total Billed</div>
            <div className="num">PKR {formatNumber(stats.billed)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Collected</div>
            <div className="num" style={{ color: "#16a34a" }}>PKR {formatNumber(stats.collected)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Outstanding</div>
            <div className="num" style={{ color: stats.outstanding > 0 ? "#dc2626" : undefined }}>
              PKR {formatNumber(stats.outstanding)}
            </div>
          </div>
          <div className="pay-stat">
            <div className="tag">Paid Vouchers</div>
            <div className="num">{stats.paid}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Pending</div>
            <div className="num">{stats.pending}</div>
          </div>
        </div>

        {sysMsg ? <div className="alert" style={{ marginTop: 10 }}>{sysMsg}</div> : null}

        {/* Action buttons */}
        {canEdit ? (
          <div className="form-actions no-print" style={{ marginTop: 12, marginBottom: 0 }}>
            <button type="button" className="btn-ghost" onClick={async () => {
              setSysMsg("");
              const res = await fetch("/api/fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "late-fees" }) });
              const d = await res.json();
              setSysMsg(res.ok ? `Late fees applied on ${d.updated || 0} voucher(s) — ${d.percent}% after ${d.graceDays} grace days` : d.error || "Failed");
              load();
            }}>Apply Late Fees</button>
          </div>
        ) : null}
      </Panel>

      {/* ── Main tabs ──────────────────────────────────────────────────── */}
      <div className="chips" style={{ padding: "0 24px", marginBottom: 0 }}>
        {[
          { key: "generate", label: "Generate Fees" },
          { key: "pending",  label: `Pending (${stats.pending})` },
          { key: "received", label: `Received (${stats.paid})` },
          { key: "all",      label: "All Vouchers" },
        ].map(({ key, label }) => (
          <button key={key} type="button"
            className={`filter-chip${tab === key ? " active" : ""}`}
            onClick={() => setTab(key as MainTab)}
          >{label}</button>
        ))}
      </div>

      {/* ══ GENERATE TAB ══════════════════════════════════════════════════ */}
      {tab === "generate" && canEdit ? (
        <Panel title="Fee Voucher Builder" meta="Design the fee, then apply to a class or a single student">
          <form onSubmit={applyFees}>
            {builderMsg ? <div className="alert" style={{ marginBottom: 14 }}>{builderMsg}</div> : null}

            {/* Target selector */}
            <div className="chips" style={{ marginBottom: 18 }}>
              <button type="button"
                className={`filter-chip${builderTarget === "class" ? " active" : ""}`}
                onClick={() => setBuilderTarget("class")}
              >Apply to Class / Section</button>
              <button type="button"
                className={`filter-chip${builderTarget === "student" ? " active" : ""}`}
                onClick={() => setBuilderTarget("student")}
              >Single Student</button>
            </div>

            <div className="form-grid">
              {builderTarget === "class" ? (
                <Field label="Class / Section">
                  <select className={inputClass} value={builderClassId}
                    onChange={(e) => setBuilderClassId(e.target.value)}>
                    <option value="">All Classes (school-wide)</option>
                    {classes.map((c) => (
                      <option key={c._id} value={c._id}>{c.name} — Section {c.section}</option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Student" required>
                  <select className={inputClass} value={builderStudentId}
                    onChange={(e) => setBuilderStudentId(e.target.value)} required>
                    <option value="">Select student…</option>
                    {students.map((s) => (
                      <option key={s._id} value={s._id}>
                        {fullName(s)} — {labelOfClass(s.classId as never)} ({s.admissionNo})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Due Date" required>
                <input type="date" className={inputClass} value={builderDue}
                  onChange={(e) => setBuilderDue(e.target.value)} required />
              </Field>
              <Field label="Voucher Title (optional)">
                <input type="text" className={inputClass} value={builderTitle}
                  onChange={(e) => setBuilderTitle(e.target.value)}
                  placeholder="e.g. Monthly Fee – November 2026" />
              </Field>
            </div>

            {/* Fee heads */}
            <div style={{ margin: "18px 0 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Fee Heads</span>
              {coaAccounts.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  Link each head to a Chart of Accounts entry for bookkeeping
                </span>
              )}
            </div>
            <div className="voucher-line-head fee-line-head" style={{ gridTemplateColumns: coaAccounts.length ? "1fr 130px 1fr 28px" : "1fr 130px 28px" }}>
              <span>Fee Head</span>
              <span>Amount (PKR)</span>
              {coaAccounts.length > 0 && <span>COA Account</span>}
              <span />
            </div>
            {builderLines.map((line, i) => (
              <div className="voucher-line-row fee-line-row" key={i} style={{ gridTemplateColumns: coaAccounts.length ? "1fr 130px 1fr 28px" : "1fr 130px 28px" }}>
                <OptionSelect
                  listKey="feeHeads"
                  value={line.head}
                  onChange={(head) => setLine(i, { head })}
                  placeholder="e.g. Tuition Fee, Transport, Exam Fee…"
                  addLabel="Add fee head"
                />
                <input type="number" min={0} className={inputClass}
                  value={line.amount}
                  onChange={(e) => setLine(i, { amount: Number(e.target.value) })}
                  placeholder="0" />
                {coaAccounts.length > 0 && (
                  <select
                    className={inputClass}
                    value={line.accountCode || ""}
                    onChange={(e) => setLine(i, { accountCode: e.target.value || undefined })}
                    title="Link this fee head to a Chart of Accounts income account"
                  >
                    <option value="">— No COA link —</option>
                    {coaAccounts.filter(a => a.type === "income").map(a => (
                      <option key={a.code} value={a.code}>{a.code} · {a.name}</option>
                    ))}
                    {coaAccounts.filter(a => a.type !== "income").length > 0 && (
                      <optgroup label="Other accounts">
                        {coaAccounts.filter(a => a.type !== "income").map(a => (
                          <option key={a.code} value={a.code}>{a.code} · {a.name} ({a.type})</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
                <button type="button" className="link-btn danger"
                  onClick={() => setBuilderLines((p) => p.length <= 1 ? p : p.filter((_, idx) => idx !== i))}
                  disabled={builderLines.length <= 1}>✕</button>
              </div>
            ))}

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button type="button" className="btn-ghost"
                onClick={() => setBuilderLines((p) => [...p, { head: "", amount: 0 }])}>
                + Add Fee Head
              </button>
              <div className="voucher-balance">
                Per student · PKR {formatNumber(builderTotal)}
              </div>
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center" }}>
              <button type="submit" className="btn-dark" disabled={builderLoading}>
                {builderLoading ? "Generating…" : builderTarget === "class" ? `Apply to ${builderClassId ? classes.find((c) => c._id === builderClassId)?.name + " Students" : "All Students"}` : "Create Voucher"}
              </button>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {builderTarget === "class" ? "Concessions auto-applied · Duplicate months skipped" : "Concession will be auto-applied"}
              </span>
            </div>
          </form>
        </Panel>
      ) : null}

      {/* ══ PENDING TAB ═══════════════════════════════════════════════════ */}
      {tab === "pending" ? (
        <Panel title="Pending & Overdue" meta="Students who have not yet paid">
          <ClassFilter />
          {!pendingFees.length ? (
            <EmptyState message="No pending fees for this selection." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Fee</th>
                    <th>Due Date</th>
                    <th className="right">Amount</th>
                    <th className="right">Paid</th>
                    <th className="right">Status</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingFees.map((fee) => <FeeRow key={fee._id} fee={fee} showPay />)}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {/* ══ RECEIVED TAB ══════════════════════════════════════════════════ */}
      {tab === "received" ? (
        <Panel title="Fee Received" meta="Fully paid vouchers">
          <ClassFilter />
          {!receivedFees.length ? (
            <EmptyState message="No paid fees for this selection." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Fee</th>
                    <th>Due Date</th>
                    <th className="right">Amount</th>
                    <th className="right">Paid</th>
                    <th className="right">Status</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {receivedFees.map((fee) => <FeeRow key={fee._id} fee={fee} />)}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {/* ══ ALL VOUCHERS TAB ══════════════════════════════════════════════ */}
      {tab === "all" ? (
        <Panel title="All Vouchers">
          <ClassFilter />
          {!fees.filter((f) => !filterClass || studentClass(f) === filterClass).length ? (
            <EmptyState message="No fee vouchers found." />
          ) : (
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Fee</th>
                    <th>Due Date</th>
                    <th className="right">Amount</th>
                    <th className="right">Paid</th>
                    <th className="right">Status</th>
                    <th className="right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {fees
                    .filter((f) => !filterClass || studentClass(f) === filterClass)
                    .map((fee) => <FeeRow key={fee._id} fee={fee} showPay />)}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {/* ── Voucher print modal ─────────────────────────────────────────── */}
      {voucher ? (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setVoucherId(""); }}>
          <div className="modal">
            <div className="fee-voucher">
              <div className="fv-head">
                <div>
                  <h2 style={{ fontSize: 17 }}>Fee Challan</h2>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 3 }}>
                    Due {prettyDate(voucher.dueDate)}
                  </div>
                </div>
                <div className="fv-tag">{voucher.status}</div>
              </div>
              <div className="fee-row">
                <span>Student</span>
                <span style={{ fontWeight: 600 }}>
                  {voucherStudent ? `${fullName(voucherStudent)} — ${voucherStudent.admissionNo}` : "Unknown"}
                </span>
              </div>
              <div className="fee-row">
                <span>Class</span>
                <span>{voucherStudent ? labelOfClass(voucherStudent.classId as never) : "—"}</span>
              </div>
              {(voucher.lines?.length
                ? voucher.lines
                : [{ head: voucher.title, amount: voucher.amount }]
              ).map((line, i) => (
                <div className="fee-row" key={`${line.head}-${i}`}>
                  <span>{line.head}</span>
                  <span className="mono">{formatNumber(line.amount)}</span>
                </div>
              ))}
              {voucher.discountAmount ? (
                <div className="fee-row">
                  <span>Concession {voucher.discountType ? `(${voucher.discountType})` : ""} {voucher.discountPercent ? `${voucher.discountPercent}%` : ""}</span>
                  <span className="mono">- {formatNumber(voucher.discountAmount)}</span>
                </div>
              ) : null}
              {voucher.lateFeeAmount ? (
                <div className="fee-row" style={{ color: "#dc2626" }}>
                  <span>Late Fee</span>
                  <span className="mono">+ {formatNumber(voucher.lateFeeAmount)}</span>
                </div>
              ) : null}
              <div className="fee-row"><span>Net Payable</span><span className="mono">{formatNumber(voucher.amount)}</span></div>
              <div className="fee-row"><span>Paid</span><span className="mono">- {formatNumber(voucher.paidAmount)}</span></div>
              <div className="fee-row total">
                <span>BALANCE DUE</span>
                <span>PKR {formatNumber(voucher.amount - voucher.paidAmount)}</span>
              </div>
              {voucher.paymentDate ? (
                <div className="fee-row" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  <span>Paid on</span>
                  <span>{prettyDate(voucher.paymentDate)} via {voucher.method || "—"}</span>
                </div>
              ) : null}
              <div className="form-actions" style={{ flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="btn-dark" onClick={() => {
                  document.body.classList.add("printing-modal");
                  window.print();
                  setTimeout(() => document.body.classList.remove("printing-modal"), 500);
                }}>Print Challan</button>
                {voucherStudent?.parentPhone ? (
                  <a
                    href={`https://api.whatsapp.com/send?phone=${voucherStudent.parentPhone.replace(/\D/g, "")}&text=${encodeURIComponent(
                      `*Fee Challan*\nStudent: ${fullName(voucherStudent)}\nAdmission No: ${voucherStudent.admissionNo}\nTitle: ${voucher.title}\nDue Date: ${prettyDate(voucher.dueDate)}\nBalance Due: PKR ${formatNumber(voucher.amount - voucher.paidAmount)}\nStatus: ${voucher.status}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost"
                    style={{ textDecoration: "none" }}
                  >
                    Share on WhatsApp
                  </a>
                ) : null}
                <button type="button" className="btn-ghost" onClick={() => setVoucherId("")}>Close</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Single voucher form */}
      <FeeForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={load}
        initial={editFee}
        students={students}
      />
    </>
  );
}
