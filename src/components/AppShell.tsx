"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import {
  AccountingIcon,
  AttendanceIcon,
  BellIcon,
  ChevronDownIcon,
  ClassesIcon,
  DashboardIcon,
  DistanceIcon,
  ExamsIcon,
  FeesIcon,
  GlobeIcon,
  HrIcon,
  InventoryIcon,
  LogoutIcon,
  MenuIcon,
  NoticeIcon,
  ReportsIcon,
  SearchIcon,
  SettingsIcon,
  StudentsIcon,
  SubjectsIcon,
  TeachersIcon,
} from "@/components/Icons";

/** `roles` limits an entry; leaving it out means every signed-in role sees it. */
const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
      { href: "/reports", label: "Reports & Print", Icon: ReportsIcon, roles: ["admin", "teacher"] },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/students", label: "Students", Icon: StudentsIcon, roles: ["admin", "teacher"] },
      { href: "/classes", label: "Classes & Sections", Icon: ClassesIcon, roles: ["admin", "teacher"] },
      { href: "/subjects", label: "Subjects", Icon: SubjectsIcon, roles: ["admin", "teacher"] },
      { href: "/attendance", label: "Attendance", Icon: AttendanceIcon, roles: ["admin", "teacher"] },
      { href: "/exams", label: "Exams & Results", Icon: ExamsIcon, roles: ["admin", "teacher"] },
      { href: "/distance-learning", label: "Distance Learning", Icon: DistanceIcon },
    ],
  },
  {
    label: "People & HR",
    items: [
      { href: "/teachers", label: "Teachers", Icon: TeachersIcon, roles: ["admin"] },
      { href: "/staff", label: "Campus Staff", Icon: HrIcon, roles: ["admin"] },
      { href: "/hr", label: "HR & Payroll", Icon: HrIcon, roles: ["admin", "teacher"] },
    ],
  },
  {
    label: "Finance & Ops",
    items: [
      { href: "/fees", label: "Fee Vouchers", Icon: FeesIcon, roles: ["admin", "staff", "student", "parent"] },
      { href: "/accounting", label: "Accounting", Icon: AccountingIcon, roles: ["admin"] },
      { href: "/inventory", label: "Inventory", Icon: InventoryIcon, roles: ["admin", "staff"] },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/website", label: "Website & Admissions", Icon: GlobeIcon, roles: ["admin"] },
      { href: "/notices", label: "Notices & Events", Icon: NoticeIcon },
      { href: "/settings", label: "Settings", Icon: SettingsIcon, roles: ["admin"] },
    ],
  },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { name: string; email: string; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([
    { code: "MAIN", name: "Main Campus" },
  ]);
  const [campus, setCampus] = useState("MAIN");
  const [academicYear, setAcademicYear] = useState("");

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.roles || item.roles.includes(user.role)),
    }))
    .filter((group) => group.items.length);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const list = d.settings?.branches;
        if (list?.length) {
          setBranches(list);
          const saved = typeof window !== "undefined" ? localStorage.getItem("sabaq_branch") : null;
          const def = saved || d.settings.defaultBranchCode || list[0].code;
          setCampus(def);
        }
        const year =
          d.activeSession?.name || d.settings?.academicYear || "";
        if (year) setAcademicYear(year);
      })
      .catch(() => {});
  }, []);

  function switchCampus(code: string) {
    setCampus(code);
    if (typeof window !== "undefined") localStorage.setItem("sabaq_branch", code);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="app">
      <aside className={`sidebar${open ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-badge">S</div>
          <div className="brand-text">
            Sabaq
            <small>ALL-IN-ONE SCHOOL ERP</small>
          </div>
        </div>

        <div className="nav-scroll">
          {visibleGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`nav-item${active ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <Icon />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar-foot">
          <div className="avatar">{initials(user.name)}</div>
          <div style={{ minWidth: 0 }}>
            <div className="who">{user.name}</div>
            <div className="role">{user.role}</div>
          </div>
          <button type="button" className="logout-btn" onClick={logout} title="Sign out">
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="menu-btn" onClick={() => setOpen((v) => !v)}>
              <MenuIcon />
            </div>
            <div className="search">
              <SearchIcon />
              Search students, roll no, class, fees…
            </div>
          </div>
          <div className="topbar-right">
            <div className="icon-btn">
              <BellIcon />
              <span className="dot" />
            </div>
            <div className="term-pill">
              SESSION <b>{academicYear || "—"}</b>
            </div>
            <div className="campus-switch" style={{ padding: 0, overflow: "hidden" }}>
              <select
                aria-label="Campus"
                value={campus}
                onChange={(e) => switchCampus(e.target.value)}
                style={{
                  border: 0,
                  background: "transparent",
                  font: "inherit",
                  padding: "8px 28px 8px 12px",
                  cursor: "pointer",
                  color: "inherit",
                  appearance: "none",
                  minWidth: 120,
                }}
              >
                {branches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon style={{ width: 13, height: 13, position: "absolute", right: 10, pointerEvents: "none" }} />
            </div>
          </div>
        </div>

        <div className="content">{children}</div>
      </div>

      <div
        className={`sidebar-overlay${open ? " open" : ""}`}
        onClick={() => setOpen(false)}
      />
    </div>
  );
}
