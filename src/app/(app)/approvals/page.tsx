"use client";

import { useCallback, useEffect, useState } from "react";
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

export default function ApprovalsPage() {
  const [rows, setRows] = useState<Instance[]>([]);
  const [status, setStatus] = useState("pending");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

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

  async function act(id: string, action: "approve" | "reject" | "comment") {
    setBusy(id + action);
    setMsg("");
    const res = await fetch(`/api/platform/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note: note || undefined }),
    });
    const data = await res.json();
    setBusy("");
    if (!res.ok) {
      setErr(data.error || "Action failed");
      return;
    }
    setNote("");
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
        kicker="Workflow inbox"
        title="Approvals"
        subtitle="Leave, fee waivers and admissions share one inbox — approve here to update the linked master record."
      />

      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <div className="chips" style={{ marginBottom: 8 }}>
        {["pending", "approved", "rejected", ""].map((f) => (
          <button
            key={f || "all"}
            type="button"
            className={`filter-chip${status === f ? " active" : ""}`}
            onClick={() => setStatus(f)}
          >
            {f || "All"}
          </button>
        ))}
      </div>

      <Panel title="Pending & recent requests" meta={`${rows.length} ITEMS`}>
        <Field label="Decision note (optional)">
          <input
            className={inputClass}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for approve / reject"
          />
        </Field>

        {!rows.length ? (
          <EmptyState message="No workflow instances. Seed platform defaults in Settings, then submit leave or a fee waiver." />
        ) : (
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Workflow</th>
                  <th>Step</th>
                  <th>Updated</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <div className="name-main">{row.title}</div>
                      <div className="muted small">
                        {row.subjectType} · {String(row.subjectId).slice(-6)}
                      </div>
                    </td>
                    <td>
                      {row.workflowCode}
                      <div className="muted small">{row.category}</div>
                    </td>
                    <td>{row.currentStep}</td>
                    <td>{prettyDate(row.updatedAt)}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="row-actions">
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
