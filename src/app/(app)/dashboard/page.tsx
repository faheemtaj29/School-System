"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel, StatusBadge, NameCell, EmptyState } from "@/components/ui";
import {
  AlertIcon,
  CheckCalendarIcon,
  ExamsIcon,
  FeesIcon,
  PersonIcon,
  StudentsIcon,
} from "@/components/Icons";
import {
  ExamItem,
  FeeItem,
  StudentItem,
  dayMonth,
  formatCompact,
  fullName,
  labelOfClass,
} from "@/lib/types";
import {
  StudentDashboard,
  TeacherDashboard,
  UnlinkedNotice,
  type StudentData,
  type TeacherData,
} from "./RoleDashboards";

type Stats = {
  students: number;
  teachers: number;
  classes: number;
  subjects: number;
  exams: number;
  upcomingExamCount: number;
  attendanceToday: number | null;
  fees: {
    billed: number;
    collected: number;
    pending: number;
    overdue: number;
    overdueCount: number;
  };
};

type Charts = {
  attendanceTrend: { date: string; label: string; rate: number; present: number; total: number }[];
  avgAttendance: number;
  classStrength: { label: string; count: number }[];
};

function TrendChart({ data }: { data: Charts["attendanceTrend"] }) {
  const w = 560;
  const h = 160;
  const pad = 12;
  const points = data.map((d, i) => {
    const x = data.length <= 1 ? w / 2 : (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - (d.rate / 100) * (h - pad * 2);
    return { x, y, ...d };
  });
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area =
    points.length > 0
      ? `${line} L${points[points.length - 1].x},${h} L${points[0].x},${h} Z`
      : "";

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="160" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#157A5C" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#157A5C" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#EEF1EA" strokeWidth="1">
          <line x1="0" y1="20" x2={w} y2="20" />
          <line x1="0" y1="60" x2={w} y2="60" />
          <line x1="0" y1="100" x2={w} y2="100" />
          <line x1="0" y1="140" x2={w} y2="140" />
        </g>
        {area ? <path d={area} fill="url(#areaFill)" /> : null}
        {line ? (
          <path d={line} fill="none" stroke="#157A5C" strokeWidth="3" strokeLinecap="round" />
        ) : null}
        {points.map((p) => (
          <circle key={p.date} cx={p.x} cy={p.y} r="4" fill="#157A5C" stroke="#fff" strokeWidth="2" />
        ))}
      </svg>
      <div className="chart-labels">
        {data.map((d) => (
          <span key={d.date}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: Charts["classStrength"] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  if (!data.length) return <EmptyState message="Add students to see class strength." />;
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div className="bar-col" key={d.label}>
          <div className="bar-val">{d.count}</div>
          <div className="bar-fill" style={{ height: `${Math.max((d.count / max) * 100, 6)}%` }} />
          <div className="bar-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

type RoleData =
  | ({ role: "teacher"; linked: boolean } & Partial<TeacherData>)
  | ({ role: "student" | "parent"; linked: boolean } & Partial<StudentData>)
  | { role: "admin" | "staff"; linked: boolean };

export default function DashboardPage() {
  const [role, setRole] = useState<RoleData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [charts, setCharts] = useState<Charts | null>(null);
  const [recent, setRecent] = useState<StudentItem[]>([]);
  const [recentFees, setRecentFees] = useState<FeeItem[]>([]);
  const [upcoming, setUpcoming] = useState<ExamItem[]>([]);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setRole(d);
        setStats(d.stats ?? null);
        setCharts(d.charts ?? null);
        setRecent(d.recentStudents || []);
        setRecentFees(d.recentFees || []);
        setUpcoming(d.upcomingExams || []);
      })
      .catch(() => undefined);
  }, []);

  const fees = stats?.fees;
  const collectedPct =
    fees && fees.billed > 0 ? Math.round((fees.collected / fees.billed) * 100) : 0;
  const pendingPct =
    fees && fees.billed > 0 ? Math.round((fees.pending / fees.billed) * 100) : 0;
  const overduePct =
    fees && fees.billed > 0 ? Math.round((fees.overdue / fees.billed) * 100) : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const kpis = useMemo(
    () => [
      { cls: "c1", icon: <StudentsIcon />, tag: "Total Students", value: stats?.students ?? "—", href: "/students", trend: null as string | null },
      { cls: "c2", icon: <PersonIcon />, tag: "Teaching Staff", value: stats?.teachers ?? "—", href: "/teachers", trend: null },
      {
        cls: "c3",
        icon: <CheckCalendarIcon />,
        tag: "Today's Attendance",
        value: stats?.attendanceToday != null ? `${stats.attendanceToday}%` : "—",
        href: "/attendance",
        trend: charts?.avgAttendance ? `avg ${charts.avgAttendance}%` : null,
      },
      { cls: "c4", icon: <FeesIcon />, tag: "Fee Collected", value: fees ? formatCompact(fees.collected) : "—", href: "/fees", trend: fees ? `${collectedPct}%` : null },
      { cls: "c5", icon: <AlertIcon />, tag: "Fee Overdue", value: fees ? formatCompact(fees.overdue) : "—", href: "/fees", trend: fees?.overdueCount ? `${fees.overdueCount} due` : null },
      { cls: "c6", icon: <ExamsIcon />, tag: "Upcoming Exams", value: stats?.upcomingExamCount ?? "—", href: "/exams", trend: null },
    ],
    [stats, fees, charts, collectedPct]
  );

  if (role?.role === "teacher") {
    if (!role.linked) return <UnlinkedNotice role="teacher" />;
    return <TeacherDashboard data={role as unknown as TeacherData} />;
  }
  if (role?.role === "student" || role?.role === "parent") {
    if (!role.linked) return <UnlinkedNotice role={role.role} />;
    return <StudentDashboard data={role as unknown as StudentData} />;
  }

  return (
    <>
      <div className="hero">
        <div className="hero-text">
          <h1>{greeting}</h1>
          <div className="sub">
            {role?.role === "staff"
              ? "Campus operations — fees, store and daily workflows"
              : "All-in-one campus command center"}
            <span className="live">SESSION {new Date().getFullYear()}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
          {role?.role === "staff" ? (
            <>
              <Link href="/fees" className="btn-primary">
                Fee Vouchers
              </Link>
              <Link
                href="/inventory"
                className="btn-primary"
                style={{ background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "none" }}
              >
                Inventory
              </Link>
            </>
          ) : (
            <>
              <Link href="/students" className="btn-primary">
                New Admission
              </Link>
              <Link
                href="/reports"
                className="btn-primary"
                style={{ background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "none" }}
              >
                Reports & Print
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="kpi-row colorful">
        {kpis.map((k) => (
          <Link key={k.tag} href={k.href} className={`kpi ${k.cls}`}>
            <div className="kpi-top">
              <div className="kpi-ico">{k.icon}</div>
              {k.trend ? (
                <span className={`trend ${k.cls === "c5" ? "down" : "up"}`}>{k.trend}</span>
              ) : null}
            </div>
            <div className="tag">{k.tag}</div>
            <div className="num">{k.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid-2">
        <div>
          <Panel title="Attendance Trend" meta={`LAST 7 DAYS · AVG ${charts?.avgAttendance ?? 0}%`}>
            <TrendChart data={charts?.attendanceTrend ?? []} />
          </Panel>

          <Panel title="Class Strength" meta="TOP SECTIONS">
            <BarChart data={charts?.classStrength ?? []} />
          </Panel>

          <Panel title="Recent Admissions" meta="LATEST 5">
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission</th>
                    <th>Class</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((s) => (
                    <tr key={s._id}>
                      <td><NameCell name={fullName(s)} /></td>
                      <td className="num">{s.admissionNo}</td>
                      <td>{labelOfClass(s.classId as never)}</td>
                      <td className="right"><StatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                  {!recent.length ? (
                    <tr>
                      <td colSpan={4} style={{ color: "var(--text-dim)", padding: "22px 0" }}>
                        No students yet — create a class, then enroll.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div>
          <Panel title="Fee Collection">
            <div className="ring-wrap">
              <div className="ring">
                <svg viewBox="0 0 36 36" width="126" height="126">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#F0F2ED" strokeWidth="4" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#157A5C" strokeWidth="4" strokeDasharray={`${collectedPct} 100`} strokeLinecap="round" transform="rotate(-90 18 18)" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#E8992E" strokeWidth="4" strokeDasharray={`${pendingPct} 100`} strokeDashoffset={-collectedPct} strokeLinecap="round" transform="rotate(-90 18 18)" />
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="#D6483D" strokeWidth="4" strokeDasharray={`${overduePct} 100`} strokeDashoffset={-(collectedPct + pendingPct)} strokeLinecap="round" transform="rotate(-90 18 18)" />
                </svg>
                <div className="ring-inner">
                  <b>{collectedPct}%</b>
                  <span>COLLECTED</span>
                </div>
              </div>
              <div className="legend">
                <div><span className="dot-sq" style={{ background: "var(--jade)" }} />Collected<span className="amt">{formatCompact(fees?.collected ?? 0)}</span></div>
                <div><span className="dot-sq" style={{ background: "var(--saffron)" }} />Pending<span className="amt">{formatCompact(fees?.pending ?? 0)}</span></div>
                <div><span className="dot-sq" style={{ background: "var(--red)" }} />Overdue<span className="amt">{formatCompact(fees?.overdue ?? 0)}</span></div>
              </div>
            </div>
          </Panel>

          <Panel title="Quick Modules">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { href: "/accounting", label: "Accounting", color: "var(--indigo)" },
                { href: "/inventory", label: "Inventory", color: "var(--saffron)" },
                { href: "/hr", label: "HR & Payroll", color: "var(--jade)" },
                { href: "/settings", label: "Settings", color: "#6366f1" },
                { href: "/notices", label: "Notices", color: "#d6483d" },
                { href: "/reports", label: "Reports", color: "#0ea5a0" },
              ].map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  className="spark-card"
                  style={{ textDecoration: "none", color: "inherit", borderLeft: `3px solid ${m.color}` }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>Open module →</div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Upcoming Exams">
            {upcoming.length ? (
              upcoming.map((exam) => {
                const d = dayMonth(exam.date);
                return (
                  <div className="deadline-row" key={exam._id}>
                    <span className="dname">
                      {exam.title}
                      <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                        {" "}· {labelOfClass(exam.classId as never)}
                      </span>
                    </span>
                    <span className="d">{d.day} {d.month}</span>
                  </div>
                );
              })
            ) : (
              <EmptyState message="No exams scheduled." />
            )}
          </Panel>

          <Panel title="Recent Vouchers">
            <div className="table-scroll">
              <table className="reg">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th className="right">Amount</th>
                    <th className="right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFees.map((f) => {
                    const student = typeof f.studentId === "object" ? f.studentId : null;
                    return (
                      <tr key={f._id}>
                        <td><NameCell name={student ? fullName(student) : "Unknown"} /></td>
                        <td className="num">{f.amount.toLocaleString()}</td>
                        <td className="right"><StatusBadge status={f.status} /></td>
                      </tr>
                    );
                  })}
                  {!recentFees.length ? (
                    <tr>
                      <td colSpan={3} style={{ color: "var(--text-dim)", padding: "18px 0" }}>No vouchers yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
