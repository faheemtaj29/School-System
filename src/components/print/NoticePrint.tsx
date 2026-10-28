"use client";

import { PrintShell, SchoolHead, fmtDate, usePrintData } from "./PrintShell";

type Data = {
  notice: {
    _id: string;
    title: string;
    body: string;
    audience: string;
    priority: string;
    publishDate: string;
    expiryDate?: string;
    classId?: { name: string; section: string } | null;
  };
  school: { name: string; address?: string; phone?: string; logoUrl?: string | null };
};

const AUDIENCE: Record<string, string> = {
  all: "All students, parents and staff",
  staff: "All staff",
  students: "All students",
  parents: "All parents",
};

/** A notice printed as a school circular on letterhead. */
export function NoticePrintPage({ id }: { id: string }) {
  const { data, error } = usePrintData<Data>(id ? `/api/notices/${id}` : null);
  const n = data?.notice;
  const to = n
    ? n.audience === "class" && n.classId
      ? `Students and parents of ${n.classId.name}-${n.classId.section}`
      : AUDIENCE[n.audience] || n.audience
    : "";
  return (
    <PrintShell title={n ? `Circular — ${n.title}` : "Circular"} error={error} loading={!data}>
      {data && n ? (
        <section className="doc-page circular">
          <SchoolHead school={data.school} title="CIRCULAR" sub={fmtDate(n.publishDate)} />
          <div className="circular-meta">
            <div><span>To</span><b>{to}</b></div>
            <div><span>Date</span><b>{fmtDate(n.publishDate)}</b></div>
            {n.expiryDate ? <div><span>Valid until</span><b>{fmtDate(n.expiryDate)}</b></div> : null}
            {n.priority !== "normal" ? <div><span>Priority</span><b style={{ textTransform: "uppercase" }}>{n.priority}</b></div> : null}
          </div>
          <h2 className="circular-title">{n.title}</h2>
          <div className="circular-body">{n.body}</div>
          <div className="circular-sign">
            <div>Principal / Head of Institution</div>
          </div>
        </section>
      ) : null}
    </PrintShell>
  );
}
