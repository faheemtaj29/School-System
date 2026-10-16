"use client";

import { useEffect, useState } from "react";
import { EmptyState, Panel } from "@/components/ui";
import { formatCompact, prettyDate } from "@/lib/types";
import { LEAD_STAGES, LEAD_STAGE_LABEL, type LeadStage } from "@/lib/dealership";
import { Meter, Pill, Stat, api, label, pkr, withBranch } from "./shared";

type OverviewData = {
  inventory: {
    units: number;
    costValue: number;
    listValue: number;
    potentialGross: number;
    avgDays: number;
    statusCounts: Record<string, number>;
    aging: { bucket: string; units: number; cost: number }[];
    topMakes: { make: string; units: number }[];
    aged: { _id: string; stockNo: string; label: string; days: number; listPrice: number; totalCost: number; branchCode: string }[];
  };
  sales: {
    mtdUnits: number;
    mtdRevenue: number;
    mtdGross: number;
    avgGross: number;
    financePenetration: number;
    openDeals: number;
    openValue: number;
    months: { month: string; units: number; revenue: number; gross: number }[];
  };
  pipeline: {
    stageCounts: Record<LeadStage, number>;
    total: number;
    conversion: number;
    sources: { source: string; leads: number; won: number }[];
    followUps: { _id: string; name: string; phone?: string; stage: LeadStage; assignedTo?: string; nextFollowUp: string; overdue: boolean }[];
    hot: { _id: string; name: string; stage: LeadStage; score: number; assignedTo?: string }[];
  };
  marketplace: {
    published: number;
    featured: number;
    inspected: number;
    views: number;
    inquiries: number;
    webLeads30d: number;
    topViewed: { _id: string; stockNo: string; label: string; views: number; inquiries: number }[];
  };
  branches: { code: string; name: string; units: number; stockCost: number; aged90: number; mtdUnits: number; mtdGross: number; openDeals: number }[];
  leaderboard: { name: string; units: number; gross: number; commission: number; open: number }[];
};

const AGING_COLOR: Record<string, string> = {
  "0-30": "var(--jade)",
  "31-60": "var(--indigo)",
  "61-90": "var(--saffron)",
  "90+": "var(--red)",
};

export function DealershipOverview({
  branch,
  onOpenCustomer,
}: {
  branch: string;
  onOpenCustomer: (id: string) => void;
}) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api<{ overview: OverviewData }>(withBranch("/api/dealership", branch))
      .then((d) => live && (setData(d.overview), setError("")))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [branch]);

  if (error) return <div className="alert err">{error}</div>;
  if (!data) return <EmptyState message="Loading dealership analytics…" />;

  const { inventory: inv, sales, pipeline } = data;
  const maxMonth = Math.max(1, ...sales.months.map((m) => m.gross));
  const maxAging = Math.max(1, ...inv.aging.map((a) => a.units));
  const openLeads = LEAD_STAGES.filter((s) => s !== "won" && s !== "lost");
  const maxStage = Math.max(1, ...openLeads.map((s) => pipeline.stageCounts[s] || 0));

  return (
    <>
      <div className="pay-stat-row">
        <Stat label="Units in stock" value={inv.units} hint={`${inv.statusCounts.reserved || 0} reserved · ${inv.statusCounts.reconditioning || 0} in recon`} />
        <Stat label="Stock at cost" value={pkr(inv.costValue)} hint={`List ${pkr(inv.listValue)}`} />
        <Stat label="Potential gross" value={pkr(inv.potentialGross)} tone="good" />
        <Stat label="Avg days in stock" value={inv.avgDays} tone={inv.avgDays > 60 ? "bad" : inv.avgDays > 45 ? "warn" : "good"} />
        <Stat label="Sold this month" value={sales.mtdUnits} hint={`Gross ${pkr(sales.mtdGross)}`} tone="good" />
      </div>
      <div className="pay-stat-row" style={{ marginTop: 4 }}>
        <Stat label="Open deals" value={sales.openDeals} hint={pkr(sales.openValue)} />
        <Stat label="Avg gross / unit" value={pkr(sales.avgGross)} />
        <Stat label="Finance penetration" value={`${sales.financePenetration}%`} />
        <Stat label="Lead conversion" value={`${pipeline.conversion}%`} hint={`${pipeline.total} leads total`} />
        <Stat label="Follow-ups due" value={pipeline.followUps.length} tone={pipeline.followUps.some((f) => f.overdue) ? "bad" : undefined} />
      </div>

      <div className="grid-2">
        <Panel title="Gross profit — last 6 months" meta="Delivered deals">
          <div className="bar-chart">
            {sales.months.map((m) => (
              <div className="bar-col" key={m.month} title={`${m.units} units · ${pkr(m.revenue)} revenue`}>
                <div className="bar-val">{formatCompact(m.gross)}</div>
                <div className="bar-fill" style={{ height: `${(m.gross / maxMonth) * 100}%` }} />
                <div className="bar-label">
                  {m.month} · {m.units}u
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Stock aging" meta="Unsold units by days on lot">
          <div className="dl-rows">
            {inv.aging.map((a) => (
              <div className="dl-row" key={a.bucket}>
                <span className="dl-row-label">{a.bucket} days</span>
                <Meter value={a.units} max={maxAging} color={AGING_COLOR[a.bucket]} />
                <span className="dl-row-val">
                  {a.units}u · {pkr(a.cost)}
                </span>
              </div>
            ))}
          </div>
          {inv.aged.length ? (
            <>
              <div className="form-section-title" style={{ marginTop: 14 }}>Aged over 60 days — price action needed</div>
              <table className="reg">
                <tbody>
                  {inv.aged.map((v) => (
                    <tr key={v._id}>
                      <td>
                        <b>{v.stockNo}</b> {v.label}
                      </td>
                      <td>{v.branchCode}</td>
                      <td className="num" style={{ color: v.days > 90 ? "var(--red)" : "#96650f" }}>{v.days}d</td>
                      <td className="num">{pkr(v.listPrice - v.totalCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel title="Sales pipeline" meta={`${pipeline.stageCounts.won || 0} won · ${pipeline.stageCounts.lost || 0} lost`}>
          <div className="dl-rows">
            {openLeads.map((s) => (
              <div className="dl-row" key={s}>
                <span className="dl-row-label">{LEAD_STAGE_LABEL[s]}</span>
                <Meter value={pipeline.stageCounts[s] || 0} max={maxStage} />
                <span className="dl-row-val">{pipeline.stageCounts[s] || 0}</span>
              </div>
            ))}
          </div>
          <div className="form-section-title" style={{ marginTop: 14 }}>Lead sources</div>
          <div className="chips">
            {pipeline.sources.map((s) => (
              <span className="filter-chip" key={s.source}>
                {label(s.source)} · {s.leads} ({s.leads ? Math.round((s.won / s.leads) * 100) : 0}% won)
              </span>
            ))}
            {!pipeline.sources.length ? <span className="muted small">No leads yet</span> : null}
          </div>
        </Panel>

        <Panel title="Follow-ups due today" meta="Overdue first">
          {pipeline.followUps.length ? (
            <table className="reg">
              <tbody>
                {pipeline.followUps.map((f) => (
                  <tr key={f._id}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => onOpenCustomer(f._id)}>
                        {f.name}
                      </button>
                      <div className="muted small">{f.phone || "—"} · {f.assignedTo || "Unassigned"}</div>
                    </td>
                    <td><Pill value={f.stage} /></td>
                    <td className="right" style={{ color: f.overdue ? "var(--red)" : undefined }}>
                      {f.overdue ? "Overdue · " : ""}
                      {prettyDate(f.nextFollowUp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="No follow-ups due. Nice." />
          )}
          {pipeline.hot.length ? (
            <>
              <div className="form-section-title" style={{ marginTop: 14 }}>Hottest leads</div>
              <div className="chips">
                {pipeline.hot.map((h) => (
                  <button type="button" key={h._id} className="filter-chip" onClick={() => onOpenCustomer(h._id)}>
                    {h.name} · {h.score}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      </div>

      <Panel title="Online marketplace" meta="Public /cars listings">
        <div className="pay-stat-row" style={{ marginTop: 4 }}>
          <Stat label="Live listings" value={data.marketplace.published} hint={`${data.marketplace.featured} featured · ${data.marketplace.inspected} inspected`} />
          <Stat label="Listing views" value={data.marketplace.views.toLocaleString()} />
          <Stat label="Enquiries" value={data.marketplace.inquiries} hint={data.marketplace.views ? `${((data.marketplace.inquiries / data.marketplace.views) * 100).toFixed(1)}% of views` : undefined} />
          <Stat label="Web leads (30d)" value={data.marketplace.webLeads30d} tone="good" />
          <Stat label="Unlisted stock" value={Math.max(0, inv.units - data.marketplace.published)} tone={inv.units - data.marketplace.published > 0 ? "warn" : undefined} hint="Publish to get leads" />
        </div>
        {data.marketplace.topViewed.length ? (
          <table className="reg">
            <tbody>
              {data.marketplace.topViewed.map((v) => (
                <tr key={v._id}>
                  <td><b>{v.stockNo}</b> {v.label}</td>
                  <td className="num">{v.views} views</td>
                  <td className="num">{v.inquiries} enquiries</td>
                  <td className="right"><a className="link-btn" href={`/cars/${v._id}`} target="_blank" rel="noreferrer">View ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>

      <div className="grid-2">
        <Panel title="Branch comparison" meta="Month to date">
          <div className="table-scroll">
            <table className="reg">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th className="right">Stock</th>
                  <th className="right">At cost</th>
                  <th className="right">90d+</th>
                  <th className="right">Sold</th>
                  <th className="right">Gross</th>
                  <th className="right">Open</th>
                </tr>
              </thead>
              <tbody>
                {data.branches.map((b) => (
                  <tr key={b.code}>
                    <td>
                      <b>{b.code}</b> <span className="muted small">{b.name}</span>
                    </td>
                    <td className="num">{b.units}</td>
                    <td className="num">{formatCompact(b.stockCost)}</td>
                    <td className="num" style={{ color: b.aged90 ? "var(--red)" : undefined }}>{b.aged90}</td>
                    <td className="num">{b.mtdUnits}</td>
                    <td className="num">{formatCompact(b.mtdGross)}</td>
                    <td className="num">{b.openDeals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Sales team" meta="Last 90 days">
          {data.leaderboard.length ? (
            <table className="reg">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th className="right">Units</th>
                  <th className="right">Gross</th>
                  <th className="right">Commission</th>
                  <th className="right">Open</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((p, i) => (
                  <tr key={p.name}>
                    <td>
                      {i === 0 && p.units ? "🏆 " : ""}
                      {p.name}
                    </td>
                    <td className="num">{p.units}</td>
                    <td className="num">{pkr(p.gross)}</td>
                    <td className="num">{pkr(p.commission)}</td>
                    <td className="num">{p.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState message="No deals yet." />
          )}
          {inv.topMakes.length ? (
            <>
              <div className="form-section-title" style={{ marginTop: 14 }}>Stock mix</div>
              <div className="chips">
                {inv.topMakes.map((m) => (
                  <span key={m.make} className="filter-chip">
                    {m.make} · {m.units}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
