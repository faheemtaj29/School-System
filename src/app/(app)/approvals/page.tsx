"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { EmptyState, Field, Hero, Panel, StatusBadge, inputClass } from "@/components/ui";
import { prettyDate } from "@/lib/types";

type Instance = {
  _id: string;
  workflowCode: string;
  category: string;
  title: string;
  status: string;
  currentStep: number;
  subjectType: string;
  subjectId: string;
  history?: { stepKey: string; action: string; byName?: string; note?: string; at: string }[];
  payload?: Record<string, unknown>;
  updatedAt: string;
};

const WORKFLOW_LABELS: Record<string, string> = {
  FEE_WAIVER: "Fee Waiver / Concession",
  LEAVE: "Leave Request",
  PURCHASE: "Purchase Order",
  SCHOLARSHIP: "Scholarship Application",
  ADMISSION: "Admission Review",
};

const STEP_LABELS: Record<string, Record<number, string>> = {
  FEE_WAIVER: { 1: "Class Teacher Review", 2: "Principal Approval", 3: "Finance Approval" },
  LEAVE: { 1: "Class Teacher Review", 2: "Admin Approval" },
  PURCHASE: { 1: "Department Review", 2: "Finance Approval", 3: "Principal Approval" },
  SCHOLARSHIP: { 1: "Academic Review", 2: "Principal Approval", 3: "Finance Approval" },
  ADMISSION: { 1: "Coordinator Review", 2: "Principal Approval" },
};

export default function ApprovalsPage() {
  const [rows, setRows] = useState<Instance[]>([]);
  const [status, setStatus] = useState("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 });

  const loadCounts = useCallback(async () => {
    const res = await fetch("/api/platform?view=instances");
    const data = await res.json();
    if (!res.ok) return;
    const all: Instance[] = data.instances || [];
    setCounts({
      pending: all.filter((i) => i.status === "pending").length,
      approved: all.filter((i) => i.status === "approved").length,
      rejected: all.filter((i) => i.status === "rejected").length,
    });
  }, []);

  const load = useCallback(async () => {
    const q = status ? `?view=instances&status=${status}` : "?view=instances";
    const res = await fetch(`/api/platform${q}`);
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Could not load approvals");
      return;
    }
    setErr("");
    setRows(data.instances || []);
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  async function act(id: string, action: "approve" | "reject" | "comment") {
    setBusy(id + action);
    setMsg("");
    const res = await fetch(`/api/platform/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: notes[id] || undefined }),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setErr(data.error || "Action failed");
      return;
    }
    setNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
    loadCounts();
    setMsg(
      action === "approve"
        ? "Step approved — linked leave / fee / admission records sync automatically."
        : action === "reject"
          ? "Request rejected and linked record updated."
          : "Comment saved."
    );
    load();
  }

  return (
    <div className="stack-lg">
      <Hero
        title="Approvals"
        subtitle="Leave, fee waivers and admissions share one inbox — approve here to update the linked master record."
      />

      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <div className="chips" style={{ marginBottom: 8 }}>
        {(["pending", "approved", "rejected", ""] as const).map((f) => {
          const count = f ? counts[f] : Object.values(counts).reduce((a, b) => a + b, 0);
          return (
            <button
              key={f || "all"}
              type="button"
              className={`filter-chip${status === f ? " active" : ""}`}
              onClick={() => setStatus(f)}
            >
              {f || "All"}
              {count > 0 ? <span className="chip-badge">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <Panel title="Pending & recent requests" meta={`${rows.length} ITEMS`}>
        {!rows.length ? (
          <EmptyState message="No workflow instances. Seed platform defaults in Settings, then submit leave or a fee waiver." />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Workflow</th>
                  <th>Current step</th>
                  <th>Updated</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const wLabel = WORKFLOW_LABELS[row.workflowCode] || row.workflowCode;
                  const stepLabel =
                    STEP_LABELS[row.workflowCode]?.[row.currentStep] ||
                    `Step ${row.currentStep}`;
                  const histOpen = expandedHistory === row._id;
                  return (
                    <Fragment key={row._id}>
                      <tr>
                        <td>
                          <div className="name-main">{row.title}</div>
                          <div className="muted small">
                            {row.subjectType} · {String(row.subjectId).slice(-6)}
                          </div>
                        </td>
                        <td>
                          <div>{wLabel}</div>
                          <div className="muted small">{row.category}</div>
                        </td>
                        <td>{stepLabel}</td>
                        <td>{prettyDate(row.updatedAt)}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="row-actions">
                          {row.history?.length ? (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => setExpandedHistory(histOpen ? null : row._id)}
                            >
                              {histOpen ? "Hide" : "History"}
                            </button>
                          ) : null}
                          {row.status === "pending" ? (
                            <>
                              <button
                                type="button"
                                className="btn-dark"
                                disabled={!!busy}
                                onClick={() => act(row._id, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn-ghost"
                                disabled={!!busy}
                                onClick={() => act(row._id, "reject")}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                      {row.status === "pending" ? (
                        <tr>
                          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 8 }}>
                            <Field label="Note for this decision (optional)">
                              <input
                                className={inputClass}
                                value={notes[row._id] || ""}
                                onChange={(e) =>
                                  setNotes((prev) => ({ ...prev, [row._id]: e.target.value }))
                                }
                                placeholder="Reason for approve / reject"
                              />
                            </Field>
                          </td>
                        </tr>
                      ) : null}
                      {histOpen && row.history?.length ? (
                        <tr>
                          <td colSpan={6} style={{ background: "var(--surface-raised, var(--card))", padding: "12px 16px" }}>
                            <div className="muted small" style={{ marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em" }}>
                              Step history
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {row.history.map((h, i) => (
                                <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                                  <span className="muted small" style={{ minWidth: 130 }}>{prettyDate(h.at)}</span>
                                  <span style={{ fontSize: 13 }}>
                                    <b>{h.stepKey}</b>
                                    {" — "}
                                    <span style={{ textTransform: "capitalize" }}>{h.action}</span>
                                    {h.byName ? ` by ${h.byName}` : ""}
                                    {h.note ? <span className="muted small"> · {h.note}</span> : null}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
