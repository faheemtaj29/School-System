"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
import { CollectModal, FeeStructurePanel, monthName, type CollectTarget } from "@/components/fees/FeeTools";
import { useSchoolProfile } from "@/lib/useSchoolProfile";
import {
  FeeItem,
  StudentItem,
  formatNumber,
  fullName,
  labelOfClass,
  prettyDate,
  toDateInput,
  photoSrc,
} from "@/lib/types";

type MainTab = "generate" | "structure" | "received" | "pending" | "all";

export default function FeesPage() {
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [classes, setClasses] = useState<{ _id: string; name: string; section: string }[]>([]);
  const [role, setRole] = useState("admin");
  const canEdit = role === "admin" || role === "staff";
  const { currency: cur } = useSchoolProfile();

  // Main tab
  const [tab, setTab] = useState<MainTab>("generate");

  // Fee builder state
  const [builderTarget, setBuilderTarget] = useState<"class" | "student">("class");
  const [builderClassId, setBuilderClassId] = useState("");
  const [builderStudentId, setBuilderStudentId] = useState("");
  const [builderDue, setBuilderDue] = useState(toDateInput(new Date()));
  const [builderTitle, setBuilderTitle] = useState("");
  const [builderLines, setBuilderLines] = useState<{ head: string; amount: number }[]>([
    { head: "Tuition Fee", amount: 0 },
  ]);
  const [builderMsg, setBuilderMsg] = useState("");
  const [builderLoading, setBuilderLoading] = useState(false);

  // Received/Pending filters
  const [filterClass, setFilterClass] = useState("");
  const [feeSearch, setFeeSearch] = useState("");
  // Opened from a student's profile: /fees?q=<admission no.>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL
    if (q) setFeeSearch(q);
  }, []);

  // Single voucher edit
  const [editOpen, setEditOpen] = useState(false);
  const [editFee, setEditFee] = useState<FeeItem | null>(null);

  // Counter collection (opens the 2-copy receipt)
  const [collecting, setCollecting] = useState<CollectTarget | null>(null);
  const [filterMonth, setFilterMonth] = useState("");

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
      const [s, c] = await Promise.all([
        fetch("/api/students").then((r) => r.json()),
        fetch("/api/classes").then((r) => r.json()),
      ]);
      setStudents(s.students || []);
      setClasses(c.classes || []);
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

  function setLine(i: number, patch: Partial<{ head: string; amount: number }>) {
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
            ` · ${data.skipped} already billed · ${cur} ${formatNumber(data.billedAmount)} total` +
            (data.discountTotal ? ` · ${cur} ${formatNumber(data.discountTotal)} concessions` : "")
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
    return `${fullName(s)} ${s.admissionNo || ""} ${fee.receiptNo || ""}`.toLowerCase();
  }

  const receivedFees = useMemo(() =>
    fees.filter((f) => f.status === "paid" &&
      (!filterClass || studentClass(f) === filterClass) &&
      (!filterMonth || f.billingMonth === filterMonth) &&
      (!feeSearch || feeStudentName(f).includes(feeSearch.toLowerCase()))),
    [fees, filterClass, filterMonth, feeSearch]);

  const pendingFees = useMemo(() =>
    fees.filter((f) => (f.status === "pending" || f.status === "overdue" || f.status === "partial") &&
      (!filterClass || studentClass(f) === filterClass) &&
      (!filterMonth || f.billingMonth === filterMonth) &&
      (!feeSearch || feeStudentName(f).includes(feeSearch.toLowerCase()))),
    [fees, filterClass, filterMonth, feeSearch]);

  const voucher = fees.find((f) => f._id === voucherId) ?? null;
  const voucherStudent = voucher && typeof voucher.studentId === "object" ? voucher.studentId : null;

  // ── Render helpers ──────────────────────────────────────────────────────
  function FeeRow({ fee, showPay }: { fee: FeeItem; showPay?: boolean }) {
    const s = typeof fee.studentId === "object" ? fee.studentId : null;
    return (
      <>
        <tr key={fee._id} style={{ background: fee.status === "overdue" ? "var(--red-bg, #fff1f1)" : undefined }}>
          <td>
            <NameCell
              name={s ? fullName(s) : "Unknown"}
              photo={s ? photoSrc("student", s) : null}
              sub={s ? `${s.admissionNo} · ${labelOfClass(s.classId as never)}` : undefined}
            />
          </td>
          <td>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{fee.title}</div>
            {fee.lines?.length ? (
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {fee.lines.map((l) => `${l.head} ${cur} ${formatNumber(l.amount)}`).join(" · ")}
              </div>
            ) : null}
          </td>
          <td className="num">{prettyDate(fee.dueDate)}</td>
          <td className="num" style={{ fontWeight: 600 }}>{cur} {formatNumber(fee.amount)}</td>
          <td className="num" style={{ color: fee.paidAmount > 0 ? "#16a34a" : "var(--text-dim)" }}>
            {fee.paidAmount > 0 ? `${cur} ${formatNumber(fee.paidAmount)}` : "—"}
          </td>
          <td className="right">
            <StatusBadge status={fee.status} />
          </td>
          <td>
            <div className="row-actions">
              <button type="button" className="link-btn" onClick={() => setVoucherId(fee._id)}>Voucher</button>
              {canEdit ? (
                <>
                  {showPay && fee.amount - fee.paidAmount > 0 ? (
                    <button
                      type="button"
                      className="link-btn collect"
                      onClick={() =>
                        setCollecting({
                          _id: fee._id,
                          studentName: s ? fullName(s) : "Student",
                          title: fee.title,
                          amount: fee.amount,
                          paidAmount: fee.paidAmount,
                        })
                      }
                    >
                      Collect
                    </button>
                  ) : null}
                  {fee.paidAmount > 0 ? (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => window.open(`/print/fee-receipt?id=${fee._id}`, "_blank", "noopener")}
                    >
                      Receipt
                    </button>
                  ) : null}
                  <button type="button" className="link-btn" onClick={() => { setEditFee(fee); setEditOpen(true); }}>Edit</button>
                </>
              ) : null}
            </div>
          </td>
        </tr>
      </>
    );
  }

  const months = useMemo(
    () => Array.from(new Set(fees.map((f) => f.billingMonth).filter(Boolean) as string[])).sort().reverse(),
    [fees]
  );

  function printChallans() {
    if (!filterMonth && !filterClass) {
      alert("Pick a month or a class first, then print its challans.");
      return;
    }
    const q = new URLSearchParams({ status: tab === "received" ? "all" : "unpaid" });
    if (filterMonth) q.set("month", filterMonth);
    if (filterClass) q.set("classId", filterClass);
    window.open(`/print/fee-challans?${q.toString()}`, "_blank", "noopener");
  }

  // Rendered by calling renderFilters() (not <Component />) so the search box keeps focus while typing.
  function renderFilters() {
    return (
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="search"
          className={inputClass}
          placeholder="Search name, admission no. or receipt no…"
          value={feeSearch}
          onChange={(e) => setFeeSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select className={inputClass} value={filterClass} onChange={(e) => setFilterClass(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">All Classes</option>
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
        <select className={inputClass} value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All Months</option>
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
        {canEdit && tab !== "received" ? (
          <>
            <button type="button" className="btn-dark" onClick={printChallans}>Print challans</button>
            <a
              className="btn-ghost"
              href={`/messages?kind=fee${filterClass ? `&classIds=${filterClass}` : ""}`}
              title="Each father gets the challan heads, totals and a link to the challan on WhatsApp"
            >
              Send challans on WhatsApp
            </a>
          </>
        ) : null}
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
        <div className="pay-stat-row">
          <div className="pay-stat">
            <div className="tag">Total Billed</div>
            <div className="num">{cur} {formatNumber(stats.billed)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Collected</div>
            <div className="num" style={{ color: "#16a34a" }}>{cur} {formatNumber(stats.collected)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Outstanding</div>
            <div className="num" style={{ color: stats.outstanding > 0 ? "#dc2626" : undefined }}>
              {cur} {formatNumber(stats.outstanding)}
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

      {sysMsg ? <div className="alert ok">{sysMsg}</div> : null}

      {/* ── Main tabs ──────────────────────────────────────────────────── */}
      <div className="chips fee-tabs">
        {[
          { key: "generate", label: "Generate Fees" },
          ...(canEdit ? [{ key: "structure", label: "Fee Structure & Monthly Billing" }] : []),
          { key: "pending",  label: `Pending (${stats.pending})` },
          { key: "received", label: `Received (${stats.paid})` },
          { key: "all",      label: "All Vouchers" },
        ].map(({ key, label }) => (
          <button key={key} type="button"
            className={`filter-chip${tab === key ? " active" : ""}`}
            onClick={() => setTab(key as MainTab)}
          >{label}</button>
        ))}
        {canEdit ? (
          <button
            type="button"
            className="btn-ghost no-print"
            style={{ marginLeft: "auto" }}
            title="Adds the late fee from Settings to overdue vouchers past the grace days"
            onClick={async () => {
              setSysMsg("");
              const res = await fetch("/api/fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "late-fees" }) });
              const d = await res.json();
              setSysMsg(res.ok ? `Late fees applied on ${d.updated || 0} voucher(s) — ${d.percent}% after ${d.graceDays} grace days` : d.error || "Failed");
              load();
            }}
          >
            Apply Late Fees
          </button>
        ) : null}
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
            <div style={{ margin: "18px 0 8px", fontWeight: 600, fontSize: 13 }}>Fee Heads</div>
            <div className="voucher-line-head fee-line-head">
              <span>Fee Head</span>
              <span>Amount ({cur})</span>
              <span />
            </div>
            {builderLines.map((line, i) => (
              <div className="voucher-line-row fee-line-row" key={i}>
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
                Per student · {cur} {formatNumber(builderTotal)}
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

      {tab === "structure" && canEdit ? <FeeStructurePanel onGenerated={load} /> : null}

      {collecting ? (
        <CollectModal
          fee={collecting}
          currency={cur}
          onClose={() => setCollecting(null)}
          onDone={() => {
            setCollecting(null);
            load();
          }}
        />
      ) : null}

      {/* ══ PENDING TAB ═══════════════════════════════════════════════════ */}
      {tab === "pending" ? (
        <Panel title="Pending & Overdue" meta="Students who have not yet paid">
          {renderFilters()}
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
          {renderFilters()}
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
          {renderFilters()}
          {!fees.filter((f) => (!filterClass || studentClass(f) === filterClass) && (!filterMonth || f.billingMonth === filterMonth)).length ? (
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
                    .filter((f) => (!filterClass || studentClass(f) === filterClass) && (!filterMonth || f.billingMonth === filterMonth))
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
                <span>{cur} {formatNumber(voucher.amount - voucher.paidAmount)}</span>
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
                      `*Fee Challan*\nStudent: ${fullName(voucherStudent)}\nAdmission No: ${voucherStudent.admissionNo}\nTitle: ${voucher.title}\nDue Date: ${prettyDate(voucher.dueDate)}\nBalance Due: ${cur} ${formatNumber(voucher.amount - voucher.paidAmount)}\nStatus: ${voucher.status}`
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
