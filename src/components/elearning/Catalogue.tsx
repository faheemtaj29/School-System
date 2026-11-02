"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, PaginationControls, Panel, usePaginatedList } from "@/components/ui";
import { formatNumber } from "@/lib/types";

type CatalogueCourse = {
  _id: string;
  code: string;
  title: string;
  description: string;
  mode: string;
  level: string;
  fee: number;
  durationWeeks: number;
  startDate: string | null;
  status: string;
  teacher: string;
  seatsLeft: number;
  lectures: number;
  materials: number;
  weeks: number;
  myStatus: string | null;
};

type MyCourse = { _id: string; title: string; code: string; progress: number; status: string };

/** For a student: the courses they are in, with progress, and a jump back into the lessons. */
export function ContinueLearning({ courses, onOpen }: { courses: MyCourse[]; onOpen: () => void }) {
  const going = courses.filter((c) => c.status === "active");
  const waiting = courses.filter((c) => c.status === "pending");
  if (!going.length && !waiting.length) return null;
  return (
    <section className="cl-strip">
      <div className="cl-head">
        <h3>Continue learning</h3>
        <button type="button" className="link-btn" onClick={onOpen}>Open lessons →</button>
      </div>
      <div className="cl-cards">
        {going.map((c) => (
          <button key={c._id} type="button" className="cl-card" onClick={onOpen}>
            <small>{c.code}</small>
            <b>{c.title}</b>
            <div className="sp-progress"><i style={{ width: `${Math.min(100, c.progress)}%` }} /></div>
            <span>{c.progress}% complete</span>
          </button>
        ))}
        {waiting.map((c) => (
          <div key={c._id} className="cl-card cl-wait">
            <small>{c.code}</small>
            <b>{c.title}</b>
            <span>Waiting for the school to confirm your fee</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Course catalogue: every course open for joining. Students join with one click — free courses
 * start at once, paid ones go to the office to confirm the fee. Staff see it as a preview.
 */
export function CourseCatalogue({ isStudent, currency, onJoined }: { isStudent: boolean; currency: string; onJoined: () => void }) {
  const [list, setList] = useState<CatalogueCourse[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/elearning?kind=catalogue")
      .then((r) => r.json())
      .then((d) => setList(d.catalogue || []))
      .catch(() => setList([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function join(c: CatalogueCourse) {
    const ask = c.fee > 0 ? `Join "${c.title}"? The course fee is ${currency} ${formatNumber(c.fee)} — the school confirms your place once the fee is paid.` : `Join "${c.title}"? It is free and starts straight away.`;
    if (!confirm(ask)) return;
    setBusy(c._id);
    setMsg(null);
    try {
      const res = await fetch("/api/elearning?kind=catalogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: c._id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Could not join the course");
      setMsg({
        ok: true,
        text: d.status === "active" ? `You joined ${c.title}. Its lectures and materials are now open to you.` : `Request sent for ${c.title}. You will get access once the fee is confirmed.`,
      });
      load();
      onJoined();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  const shown = useMemo(() => (list || []).filter((c) => !q || `${c.code} ${c.title} ${c.teacher} ${c.level}`.toLowerCase().includes(q.toLowerCase())), [list, q]);
  const pagination = usePaginatedList(shown);

  return (
    <Panel title="Course Catalogue" meta={list ? `${list.length} OPEN COURSES` : undefined}>
      {msg ? <div className={`alert ${msg.ok ? "ok" : "err"}`}>{msg.text}</div> : null}
      <div className="mat-bar">
        <input className="inp" style={{ maxWidth: 320 }} placeholder="Search courses, teachers…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!isStudent ? <span className="cell-sub">Students see this list and join from their portal. Set a course to Open to list it.</span> : null}
      </div>
      {!list ? (
        <EmptyState message="Loading…" />
      ) : !shown.length ? (
        <EmptyState message={list.length ? "No course matches your search." : "No courses are open for joining right now."} />
      ) : (
        <div className="cat-grid">
          {pagination.pageItems.map((c) => {
            const full = c.seatsLeft <= 0;
            return (
              <article key={c._id} className="cat-card">
                <div className="cat-top">
                  <span className="cat-code">{c.code}</span>
                  <span className="cat-mode">{c.mode}</span>
                </div>
                <h4>{c.title}</h4>
                {c.description ? <p>{c.description.length > 160 ? `${c.description.slice(0, 160)}…` : c.description}</p> : null}
                <ul className="cat-facts">
                  {c.teacher ? <li>👤 {c.teacher}</li> : null}
                  <li>🗓 {c.durationWeeks} weeks{c.startDate ? ` · starts ${new Date(c.startDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}</li>
                  <li>▶ {c.lectures} lectures · 📄 {c.materials} materials</li>
                  <li>{full ? "No seats left" : `${c.seatsLeft} seats left`}</li>
                </ul>
                <div className="cat-foot">
                  <b>{c.fee > 0 ? `${currency} ${formatNumber(c.fee)}` : "Free"}</b>
                  {isStudent ? (
                    c.myStatus === "active" || c.myStatus === "completed" ? (
                      <span className="badge present">Joined</span>
                    ) : c.myStatus === "pending" ? (
                      <span className="badge leave">Awaiting approval</span>
                    ) : (
                      <button type="button" className="btn-dark" disabled={full || busy === c._id} onClick={() => join(c)}>
                        {busy === c._id ? "Joining…" : full ? "Full" : "Join course"}
                      </button>
                    )
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {shown.length ? (
        <PaginationControls page={pagination.page} pageSize={pagination.pageSize} total={shown.length} pageCount={pagination.pageCount} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
      ) : null}
    </Panel>
  );
}
