"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Field,
  Hero,
  ModalForm,
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

const filters = ["all", "pending", "partial", "paid", "overdue"] as const;
type Filter = (typeof filters)[number];

export default function FeesPage() {
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FeeItem | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [voucherId, setVoucherId] = useState("");
  const [role, setRole] = useState("admin");
  const canEdit = role === "admin" || role === "staff";
  const [classes, setClasses] = useState<{ _id: string; name: string; section: string }[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulk, setBulk] = useState({
    classId: "",
    dueDate: toDateInput(new Date()),
  });
  const [bulkLines, setBulkLines] = useState<{ head: string; amount: number }[]>([
    { head: "Tuition Fee", amount: 0 },
  ]);

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

  async function runBulk(e: FormEvent) {
    e.preventDefault();
    setBulkMsg("");
    const res = await fetch("/api/fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "bulk",
        classId: bulk.classId || null,
        dueDate: bulk.dueDate,
        lines: bulkLines.filter((l) => l.head.trim()),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBulkMsg(data.error || "Could not generate vouchers");
      return;
    }
    setBulkMsg(
      `${data.created} voucher(s) raised · ${data.skipped} already billed · PKR ${formatNumber(data.billedAmount)} receivable` +
        (data.discountTotal
          ? ` · PKR ${formatNumber(data.discountTotal)} concessions applied`
          : "")
    );
    load();
  }

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this fee voucher?")) return;
    await fetch(`/api/fees/${id}`, { method: "DELETE" });
    load();
  }

  const totals = useMemo(() => {
    const billed = fees.reduce((sum, f) => sum + f.amount, 0);
    const collected = fees.reduce((sum, f) => sum + f.paidAmount, 0);
    return {
      billed,
      collected,
      pending: Math.max(billed - collected, 0),
      paidVouchers: fees.filter((f) => f.status === "paid").length,
      openVouchers: fees.filter((f) => f.status !== "paid").length,
    };
  }, [fees]);

  const visible = fees.filter((f) => filter === "all" || f.status === filter);
  const voucher = fees.find((f) => f._id === voucherId) ?? null;
  const voucherStudent =
    voucher && typeof voucher.studentId === "object" ? voucher.studentId : null;

  return (
    <>
      <Hero
        title="Fee Vouchers"
        subtitle={
          canEdit
            ? "Generate & track student challans"
            : "Your fee vouchers and payment status"
        }
        actionLabel={canEdit ? "Generate Voucher" : undefined}
        onAction={
          canEdit
            ? () => {
                setEditing(null);
                setOpen(true);
              }
            : undefined
        }
      />

      <Panel>
        <div className="pay-stat-row">
          <div className="pay-stat">
            <div className="tag">Total Billed</div>
            <div className="num">PKR {formatNumber(totals.billed)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Collected</div>
            <div className="num">PKR {formatNumber(totals.collected)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Outstanding</div>
            <div className="num">PKR {formatNumber(totals.pending)}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Paid Vouchers</div>
            <div className="num">{totals.paidVouchers}</div>
          </div>
          <div className="pay-stat">
            <div className="tag">Pending / Partial</div>
            <div className="num">{totals.openVouchers}</div>
          </div>
        </div>

        {canEdit ? (
          <div className="form-actions no-print" style={{ marginTop: 0, marginBottom: 14 }}>
            <button
              type="button"
              className="btn-dark"
              onClick={() => {
                setBulkMsg("");
                setBulkOpen(true);
              }}
            >
              Auto-generate class vouchers
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={async () => {
                const res = await fetch("/api/fees", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ kind: "late-fees" }),
                });
                const data = await res.json();
                setBulkMsg(
                  res.ok
                    ? `Late fees applied on ${data.updated || 0} voucher(s) (${data.percent}% after ${data.graceDays} grace days).`
                    : data.error || "Late fee run failed"
                );
                load();
              }}
            >
              Apply late fees
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                const studentId = students[0]?._id || "";
                const percent = Number(prompt("Waiver percent (1–100)", "30") || 0);
                if (!studentId || !percent) return;
                const sid = prompt("Student ID (paste from list)", studentId);
                if (!sid) return;
                fetch("/api/fees", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    kind: "waiver",
                    studentId: sid,
                    percent,
                    discountType: "need_based",
                  }),
                }).then(async (res) => {
                  const data = await res.json();
                  setBulkMsg(
                    res.ok
                      ? "Fee waiver sent to Approvals inbox."
                      : data.error || "Could not start waiver"
                  );
                });
              }}
            >
              Request fee waiver
            </button>
          </div>
        ) : null}

        <div className="chips" style={{ marginBottom: 18 }}>
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              className={`filter-chip${filter === f ? " active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All Vouchers" : f}
            </button>
          ))}
        </div>

        {!visible.length ? (
          <EmptyState
            message={
              canEdit
                ? "No fee vouchers here. Generate a voucher for a student."
                : "No fee vouchers match this statement view."
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Voucher</th>
                  <th className="right">Paid / Amount</th>
                  <th>Due Date</th>
                  <th className="right">Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((fee) => {
                  const student = typeof fee.studentId === "object" ? fee.studentId : null;
                  return (
                    <tr key={fee._id}>
                      <td>
                        <NameCell
                          name={student ? fullName(student) : "Unknown"}
                          sub={
                            student
                              ? `${student.admissionNo} · ${labelOfClass(student.classId as never)}`
                              : undefined
                          }
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{fee.title}</div>
                        {fee.lines?.length ? (
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                            {fee.lines.map((l) => l.head).join(" · ")}
                          </div>
                        ) : null}
                      </td>
                      <td className="num">
                        {formatNumber(fee.paidAmount)} / {formatNumber(fee.amount)}
                      </td>
                      <td>{prettyDate(fee.dueDate)}</td>
                      <td className="right">
                        <StatusBadge status={fee.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => setVoucherId(fee._id)}
                          >
                            Voucher
                          </button>
                          {canEdit ? (
                            <>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => {
                                  setEditing(fee);
                                  setOpen(true);
                                }}
                              >
                                Edit
                              </button>
                              {role === "admin" ? (
                                <button
                                  type="button"
                                  className="link-btn danger"
                                  onClick={() => remove(fee._id)}
                                >
                                  Delete
                                </button>
                              ) : null}
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

      {voucher ? (
        <div className="modal-backdrop" onMouseDown={() => setVoucherId("")}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
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
                  {voucherStudent
                    ? `${fullName(voucherStudent)} — ${voucherStudent.admissionNo}`
                    : "Unknown"}
                </span>
              </div>
              <div className="fee-row">
                <span>Class</span>
                <span>
                  {voucherStudent ? labelOfClass(voucherStudent.classId as never) : "—"}
                </span>
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
                  <span>
                    Concession
                    {voucher.discountType ? ` (${voucher.discountType})` : ""}
                    {voucher.discountPercent ? ` ${voucher.discountPercent}%` : ""}
                  </span>
                  <span className="mono">- {formatNumber(voucher.discountAmount)}</span>
                </div>
              ) : null}
              <div className="fee-row">
                <span>Net payable</span>
                <span className="mono">{formatNumber(voucher.amount)}</span>
              </div>
              <div className="fee-row">
                <span>Paid</span>
                <span className="mono">- {formatNumber(voucher.paidAmount)}</span>
              </div>
              <div className="fee-row total">
                <span>BALANCE DUE</span>
                <span>PKR {formatNumber(voucher.amount - voucher.paidAmount)}</span>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-dark" onClick={() => window.print()}>
                  Print
                </button>
                <button type="button" className="btn-ghost" onClick={() => setVoucherId("")}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ModalForm
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSubmit={runBulk}
        title="Auto-generate Fee Vouchers"
        subtitle="Add fee heads line by line — one multi-head challan per active student"
        submitLabel="Generate Vouchers"
        wide
      >
        {bulkMsg ? <div className="alert">{bulkMsg}</div> : null}
        <div className="form-grid">
          <Field label="Class">
            <select
              className={inputClass}
              value={bulk.classId}
              onChange={(e) => setBulk({ ...bulk, classId: e.target.value })}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} — {c.section}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due Date" required>
            <input
              type="date"
              className={inputClass}
              value={bulk.dueDate}
              onChange={(e) => setBulk({ ...bulk, dueDate: e.target.value })}
              required
            />
          </Field>
        </div>

        <div className="form-section-title" style={{ marginTop: 16 }}>
          Fee heads
        </div>
        <div className="voucher-line-head fee-line-head">
          <span>Fee head</span>
          <span>Amount</span>
          <span />
        </div>
        {bulkLines.map((line, index) => (
          <div className="voucher-line-row fee-line-row" key={index}>
            <OptionSelect
              listKey="feeHeads"
              value={line.head}
              onChange={(head) =>
                setBulkLines((prev) =>
                  prev.map((row, i) => (i === index ? { ...row, head } : row))
                )
              }
              placeholder="Select or add fee head"
              addLabel="Add fee head"
              required
            />
            <input
              type="number"
              min={0}
              className={inputClass}
              value={line.amount}
              onChange={(e) =>
                setBulkLines((prev) =>
                  prev.map((row, i) =>
                    i === index ? { ...row, amount: Number(e.target.value) } : row
                  )
                )
              }
              required
            />
            <button
              type="button"
              className="link-btn danger"
              onClick={() =>
                setBulkLines((prev) =>
                  prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)
                )
              }
              disabled={bulkLines.length <= 1}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="form-actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setBulkLines((prev) => [...prev, { head: "", amount: 0 }])}
          >
            + Add fee head line
          </button>
          <div className="voucher-balance">
            Per student · PKR{" "}
            {formatNumber(bulkLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0))}
          </div>
        </div>
      </ModalForm>

      <FeeForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={load}
        initial={editing}
        students={students}
      />
    </>
  );
}
