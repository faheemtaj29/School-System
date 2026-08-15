"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, Hero, Panel, StatusBadge, NameCell } from "@/components/ui";
import { PrintIcon } from "@/components/Icons";
import { formatNumber, fullName, labelOfClass, prettyDate } from "@/lib/types";

const REPORTS = [
  { id: "overview", label: "Overview" },
  { id: "students", label: "Students by Class" },
  { id: "classes", label: "Class Strength" },
  { id: "fees", label: "Fee Defaulters" },
  { id: "attendance", label: "Attendance" },
  { id: "exams", label: "Exams" },
  { id: "staff", label: "Staff Directory" },
  { id: "finance", label: "Finance Snapshot" },
  { id: "inventory", label: "Inventory" },
] as const;

export default function ReportsPage() {
  const [type, setType] = useState<(typeof REPORTS)[number]["id"]>("overview");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?type=${type}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = (data?.rows as Record<string, unknown>[]) || [];
  const finance = data?.data as Record<string, unknown> | undefined;

  return (
    <>
      <Hero
        title="Reports & Print"
        subtitle="Generate printable campus reports from live data"
        actionLabel="Print Report"
        actionIcon={<PrintIcon />}
        onAction={() => window.print()}
      />

      <div className="chips no-print" style={{ marginBottom: 18 }}>
        {REPORTS.map((r) => (
          <button
            key={r.id}
            type="button"
            className={`filter-chip${type === r.id ? " active" : ""}`}
            onClick={() => setType(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="print-only" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20 }}>Sabaq — {REPORTS.find((r) => r.id === type)?.label}</h2>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Generated {new Date().toLocaleString()}
        </div>
      </div>

      <Panel title={REPORTS.find((r) => r.id === type)?.label} meta={loading ? "LOADING…" : "LIVE DATA"}>
        {loading ? (
          <EmptyState message="Loading report…" />
        ) : type === "finance" || type === "overview" ? (
          <div>
            {type === "overview" && finance ? (
              <>
                <div className="pay-stat-row">
                  <div className="pay-stat">
                    <div className="tag">Fee Billed</div>
                    <div className="num">
                      {formatNumber(((finance.finance as { fees?: { billed?: number } })?.fees?.billed) ?? 0)}
                    </div>
                  </div>
                  <div className="pay-stat">
                    <div className="tag">Fee Collected</div>
                    <div className="num">
                      {formatNumber(((finance.finance as { fees?: { collected?: number } })?.fees?.collected) ?? 0)}
                    </div>
                  </div>
                  <div className="pay-stat">
                    <div className="tag">Classes Tracked</div>
                    <div className="num">{((finance.classes as unknown[]) || []).length}</div>
                  </div>
                </div>
                <h3 style={{ fontSize: 15, margin: "12px 0" }}>Class Strength</h3>
                <ClassRows rows={(finance.classes as Record<string, unknown>[]) || []} />
              </>
            ) : null}
            {type === "finance" && (data?.data as Record<string, unknown>) ? (
              <FinanceBlock data={data!.data as Record<string, unknown>} />
            ) : null}
          </div>
        ) : !rows.length ? (
          <EmptyState message="No rows for this report yet." />
        ) : type === "fees" ? (
          <FeeRows rows={rows} />
        ) : type === "attendance" ? (
          <AttRows rows={rows} />
        ) : type === "staff" ? (
          <StaffRows rows={rows} />
        ) : type === "inventory" ? (
          <InvRows rows={rows} />
        ) : type === "exams" ? (
          <ExamRows rows={rows} />
        ) : (
          <GenericRows rows={rows} />
        )}
      </Panel>
    </>
  );
}

function ClassRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Class</th>
          <th>Room</th>
          <th className="right">Capacity</th>
          <th className="right">Enrolled</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td style={{ fontWeight: 600 }}>{String(r.name)}-{String(r.section)}</td>
            <td>{String(r.room || "—")}</td>
            <td className="num">{String(r.capacity ?? "—")}</td>
            <td className="num">{String(r.enrolled ?? r.count ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GenericRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Label</th>
          <th className="right">Count</th>
          <th className="right">Active</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{String(r.className || r.label || "—")}</td>
            <td className="num">{String(r.count ?? r.enrolled ?? 0)}</td>
            <td className="num">{String(r.active ?? "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FeeRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Student</th>
          <th>Title</th>
          <th>Due</th>
          <th className="right">Balance</th>
          <th className="right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const s = r.studentId as { firstName?: string; lastName?: string; classId?: unknown } | string;
          const student = typeof s === "object" && s ? s : null;
          const amount = Number(r.amount || 0);
          const paid = Number(r.paidAmount || 0);
          return (
            <tr key={String(r._id)}>
              <td>
                <NameCell
                  name={student ? `${student.firstName} ${student.lastName}` : "—"}
                  sub={student ? labelOfClass(student.classId as never) : undefined}
                />
              </td>
              <td>{String(r.title)}</td>
              <td>{prettyDate(r.dueDate as string)}</td>
              <td className="num">{formatNumber(amount - paid)}</td>
              <td className="right"><StatusBadge status={String(r.status)} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AttRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Date</th>
          <th>Class</th>
          <th className="right">Present</th>
          <th className="right">Rate</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td>{prettyDate(r.date as string)}</td>
            <td>{labelOfClass(r.classId as never)}</td>
            <td className="num">{String(r.present)}/{String(r.total)}</td>
            <td className="right"><span className="badge present">{String(r.rate)}%</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StaffRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Staff</th>
          <th>Employee ID</th>
          <th>Email</th>
          <th className="right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td>
              <NameCell name={fullName({ firstName: String(r.firstName), lastName: String(r.lastName) })} />
            </td>
            <td className="num">{String(r.employeeId)}</td>
            <td>{String(r.email)}</td>
            <td className="right"><StatusBadge status={String(r.status)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExamRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>Exam</th>
          <th>Class</th>
          <th>Subject</th>
          <th>Date</th>
          <th className="right">Results</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td style={{ fontWeight: 600 }}>{String(r.title)}</td>
            <td>{labelOfClass(r.classId as never)}</td>
            <td>{typeof r.subjectId === "object" && r.subjectId ? String((r.subjectId as { name: string }).name) : "—"}</td>
            <td>{prettyDate(r.date as string)}</td>
            <td className="num">{Array.isArray(r.results) ? r.results.length : 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvRows({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th>SKU</th>
          <th>Item</th>
          <th>Category</th>
          <th className="right">Qty</th>
          <th className="right">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={String(r._id)}>
            <td className="num">{String(r.sku)}</td>
            <td>{String(r.name)}</td>
            <td>{String(r.category)}</td>
            <td className="num">{String(r.quantity)} {String(r.unit)}</td>
            <td className="right"><StatusBadge status={String(r.status)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FinanceBlock({ data }: { data: Record<string, unknown> }) {
  const fees = (data.fees || {}) as { billed?: number; collected?: number };
  const ledger = (data.ledger || {}) as { income?: number; expense?: number; balance?: number };
  const payroll = (data.payroll || {}) as { paid?: number; pending?: number };
  return (
    <div className="pay-stat-row">
      <div className="pay-stat"><div className="tag">Fees Billed</div><div className="num">{formatNumber(fees.billed ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Fees Collected</div><div className="num">{formatNumber(fees.collected ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Ledger Income</div><div className="num">{formatNumber(ledger.income ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Ledger Expense</div><div className="num">{formatNumber(ledger.expense ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Ledger Balance</div><div className="num">{formatNumber(ledger.balance ?? 0)}</div></div>
      <div className="pay-stat"><div className="tag">Payroll Paid</div><div className="num">{formatNumber(payroll.paid ?? 0)}</div></div>
    </div>
  );
}
