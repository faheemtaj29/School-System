"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, Hero, Panel, StatusBadge, inputClass } from "@/components/ui";
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
  createdAt?: string;
  updatedAt: string;
};

type Workflow = { code: string; name: string; steps: { key: string; label: string; role: string; order: number }[] };

/** Where the record behind each kind of request lives. */
function recordLink(row: Instance) {
  if (row.subjectType === "leave") return { href: "/hr", label: "Open HR & leave" };
  if (row.subjectType === "student") return { href: `/students/${row.subjectId}`, label: "Open student profile" };
  if (row.subjectType === "admission") return { href: "/website", label: "Open applications" };
  return null;
}

/** The useful facts from a request's payload, as label/value pairs. */
function details(row: Instance): [string, string][] {
  const p = row.payload || {};
  const out: [string, string][] = [];
  if (row.workflowCode === "LEAVE") {
    if (p.leaveType) out.push(["Type", String(p.leaveType)]);
    if (p.fromDate) out.push(["From", prettyDate(String(p.fromDate))]);
    if (p.toDate) out.push(["To", prettyDate(String(p.toDate))]);
    if (p.days) out.push(["Days", String(p.days)]);
  } else if (row.workflowCode === "FEE_WAIVER") {
    if (p.percent != null) out.push(["Concession", `${p.percent}%`]);
    if (p.discountType) out.push(["Reason", String(p.discountType).replace(/_/g, " ")]);
  } else if (row.workflowCode === "ADMISSION") {
    if (p.classApplied) out.push(["Class", String(p.classApplied)]);
    if (p.phone) out.push(["Phone", String(p.phone)]);
    if (p.branchCode) out.push(["Campus", String(p.branchCode)]);
  }
  return out;
}

export default function ApprovalsPage() {
  const [all, setAll] = useState<Instance[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [status, setStatus] = useState("pending");
  const [kind, setKind] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/platform?view=instances");
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error || "Could not load approvals");
      return;
    }
    setErr("");
    setAll(data.instances || []);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/platform?view=workflows")
      .then((r) => r.json())
      .then((d) => setWorkflows(d.workflows || []))
      .catch(() => {});
  }, [load]);

  const byCode = useMemo(() => new Map(workflows.map((w) => [w.code, w])), [workflows]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, approved: 0, rejected: 0, "": all.length };
    for (const i of all) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [all]);
  const kinds = useMemo(() => [...new Set(all.map((i) => i.workflowCode))], [all]);
  const rows = all.filter((i) => (!status || i.status === status) && (!kind || i.workflowCode === kind));

  async function act(id: string, action: "approve" | "reject") {
    if (action === "reject" && !notes[id]?.trim() && !confirm("Reject without giving a reason?")) return;
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
    setNotes((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    const done = data.instance?.status;
    setMsg(
      action === "reject"
        ? "Request rejected — the linked record is updated."
        : done === "approved"
          ? "Approved — the leave, concession or admission is updated automatically."
          : "Step approved — it has moved to the next approver."
    );
    load();
  }

  return (
    <div className="stack-lg">
      <Hero
        title="Approvals"
        subtitle="Leave requests, fee concessions and online admission applications wait here — approving updates the linked record."
      />

      {err ? <div className="alert err">{err}</div> : null}
      {msg ? <div className="alert ok">{msg}</div> : null}

      <div className="stat-row">
        <div className="stat-tile"><div className="st-val" style={{ color: counts.pending ? "#96650f" : undefined }}>{counts.pending}</div><div className="st-lab">Waiting for a decision</div></div>
        <div className="stat-tile"><div className="st-val">{counts.approved}</div><div className="st-lab">Approved</div></div>
        <div className="stat-tile"><div className="st-val">{counts.rejected}</div><div className="st-lab">Rejected</div></div>
      </div>

      <div className="accounting-toolbar">
        <div className="chips">
          {(["pending", "approved", "rejected", ""] as const).map((f) => (
            <button key={f || "all"} type="button" className={`filter-chip${status === f ? " active" : ""}`} onClick={() => setStatus(f)}>
              {f ? f[0].toUpperCase() + f.slice(1) : "All"}
              {counts[f] ? <span className="chip-badge">{counts[f]}</span> : null}
            </button>
          ))}
        </div>
        {kinds.length > 1 ? (
          <select className="inp" value={kind} onChange={(e) => setKind(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">All request types</option>
            {kinds.map((k) => (
              <option key={k} value={k}>{byCode.get(k)?.name || k}</option>
            ))}
          </select>
        ) : null}
      </div>

      <Panel title={status === "pending" ? "Waiting for a decision" : "Requests"} meta={`${rows.length} ITEMS`}>
        {!rows.length ? (
          <EmptyState
            message={
              status === "pending"
                ? "Nothing to approve. Leave requests from HR, fee concession requests and admission applications from the website appear here."
                : "No requests here."
            }
          />
        ) : (
          rows.map((row) => {
            const wf = byCode.get(row.workflowCode);
            const sorted = [...(wf?.steps || [])].sort((a, b) => a.order - b.order);
            // A "submit" step only records the request; it waits on the step after it (as the server does).
            const steps = sorted.filter((s) => s.key !== "submit");
            const at = sorted.find((s) => s.order === row.currentStep);
            const step = at?.key === "submit" ? sorted.find((s) => s.order > at.order) : at;
            const now = step?.order ?? row.currentStep;
            const by = row.history?.[0]?.byName;
            const link = recordLink(row);
            const facts = details(row);
            const histOpen = openHistory === row._id;
            return (
              <div key={row._id} className="ap-item">
                <div className="ap-main">
                  <div className="ap-head">
                    <b>{row.title}</b>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="ap-sub">
                    {wf?.name || row.workflowCode}
                    {by ? ` · requested by ${by}` : ""} · {prettyDate(row.createdAt || row.updatedAt)}
                  </div>
                  {facts.length ? (
                    <div className="ap-facts">
                      {facts.map(([k, v]) => (
                        <span key={k}><em>{k}</em> {v}</span>
                      ))}
                    </div>
                  ) : null}
                  {steps.length ? (
                    <div className="ap-steps">
                      {steps.map((s) => {
                        const state =
                          row.status === "approved" || s.order < now
                            ? "done"
                            : row.status === "pending" && s.order === now
                              ? "now"
                              : row.status === "rejected" && s.order === now
                                ? "no"
                                : "";
                        return (
                          <span key={s.key} className={`ap-step ${state}`} title={`Approver: ${s.role}`}>
                            {s.label}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  {row.history?.length ? (
                    <button type="button" className="ap-hist-btn" onClick={() => setOpenHistory(histOpen ? null : row._id)}>
                      {histOpen ? "Hide history" : `History (${row.history.length})`}
                    </button>
                  ) : null}
                  {histOpen ? (
                    <ul className="ap-history">
                      {row.history!.map((h, i) => (
                        <li key={i}>
                          <span>{prettyDate(h.at)}</span>
                          <b style={{ textTransform: "capitalize" }}>{h.action}</b>
                          {h.byName ? ` by ${h.byName}` : ""}
                          {h.note ? <em> — {h.note}</em> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="ap-side">
                  {link ? <Link href={link.href} className="link-btn">{link.label}</Link> : null}
                  {row.status === "pending" ? (
                    <>
                      {step ? <div className="ap-now">Now with: <b>{step.label}</b></div> : null}
                      <input
                        className={inputClass}
                        value={notes[row._id] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row._id]: e.target.value }))}
                        placeholder="Note / reason (optional)"
                      />
                      <div className="row-actions">
                        <button type="button" className="btn-ghost" disabled={!!busy} onClick={() => act(row._id, "reject")}>
                          Reject
                        </button>
                        <button type="button" className="btn-dark" disabled={!!busy} onClick={() => act(row._id, "approve")}>
                          {busy === row._id + "approve" ? "…" : "Approve"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </Panel>
    </div>
  );
}
