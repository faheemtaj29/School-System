"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, NameCell, Panel, StatusBadge } from "@/components/ui";
import { FeeForm } from "@/components/forms/SchoolForms";
import {
  FeeItem,
  StudentItem,
  formatNumber,
  fullName,
  labelOfClass,
  prettyDate,
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

  const load = useCallback(async () => {
    const me = await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({}));
    const myRole = me.user?.role || "admin";
    setRole(myRole);
    const f = await fetch("/api/fees").then((r) => r.json());
    setFees(f.fees || []);
    if (myRole === "admin" || myRole === "staff") {
      const s = await fetch("/api/students").then((r) => r.json());
      setStudents(s.students || []);
    }
  }, []);

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
                      <td>{fee.title}</td>
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
              <div className="fee-row">
                <span>{voucher.title}</span>
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
