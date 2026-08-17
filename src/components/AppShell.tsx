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

let shellSettingsPromise: Promise<any> | null = null;

/** `roles` limits an entry; leaving it out means every signed-in role sees it. */
const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
      { href: "/reports", label: "Reports & Print", Icon: ReportsIcon, roles: ["admin", "teacher", "student", "parent"] },
      { href: "/reports?type=result-cards", label: "Results & Result Cards", Icon: ExamsIcon, roles: ["admin", "teacher"] },
      { href: "/approvals", label: "Approvals", Icon: NoticeIcon, roles: ["admin", "staff", "teacher"] },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/students", label: "Students", Icon: StudentsIcon, roles: ["admin", "teacher"] },
      { href: "/classes", label: "Classes & Sections", Icon: ClassesIcon, roles: ["admin", "teacher"] },
      { href: "/subjects", label: "Subjects", Icon: SubjectsIcon, roles: ["admin", "teacher"] },
      { href: "/attendance", label: "Attendance", Icon: AttendanceIcon, roles: ["admin", "teacher"] },
          {
            href: "/exams",
            label: "Exams & Results",
            Icon: ExamsIcon,
            roles: ["admin", "teacher"],
            children: [
              ["/exams?module=schedule", "Exam Schedule"],
            ],
          },
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
      {
        href: "/accounting",
        label: "Accounting",
        Icon: AccountingIcon,
        roles: ["admin"],
        children: [
          ["/accounting?tab=overview", "Overview"],
          ["/accounting?tab=vouchers&type=payment&mode=cash", "Cash Payment Vouchers"],
          ["/accounting?tab=vouchers&type=payment&mode=bank", "Bank Payment Vouchers"],
          ["/accounting?tab=vouchers&type=receipt&mode=cash", "Cash Receipt Vouchers"],
          ["/accounting?tab=vouchers&type=receipt&mode=bank", "Bank Receipt Vouchers"],
          ["/accounting?tab=vouchers&type=journal", "Journal Entry Vouchers"],
          ["/accounting?tab=vouchers&type=contra", "Contra Entry Vouchers"],
          ["/accounting?tab=coa", "Chart of Accounts"],
          ["/accounting?tab=ledger", "General Ledger"],
          ["/accounting?tab=daybook", "Day Book"],
          ["/accounting?tab=trial", "Trial Balance"],
          ["/accounting?tab=pnl", "Income & Expenditure"],
          ["/accounting?tab=balance", "Balance Sheet"],
          ["/accounting?tab=bank", "Bank & WHT"],
        ],
      },
      {
        href: "/inventory",
        label: "Inventory",
        Icon: InventoryIcon,
        roles: ["admin", "staff"],
        children: [
          ["/inventory?tab=vouchers&type=purchase", "Purchase Invoices"],
          ["/inventory?tab=vouchers&type=sales", "Sales Invoices"],
          ["/inventory?tab=vouchers&type=purchase_return", "Purchase Returns"],
          ["/inventory?tab=vouchers&type=sales_return", "Sales Returns"],
          ["/inventory?tab=vouchers&type=transfer", "Stock Transfers"],
          ["/inventory?tab=vouchers&type=adjustment", "Stock Adjustments"],
          ["/inventory?tab=products", "Product Master"],
        ],
      },
      {
        href: "/campus",
        label: "Campus Ops",
        Icon: InventoryIcon,
        roles: ["admin", "staff", "teacher"],
        children: [
          ["/campus?module=timetable", "Timetable"],
          ["/campus?module=library", "Library"],
          ["/campus?module=transport", "Transport"],
          ["/campus?module=hostel", "Hostel"],
          ["/campus?module=medical", "Medical"],
          ["/campus?module=cafeteria", "Cafeteria"],
          ["/campus?module=assets", "Assets"],
          ["/campus?module=documents", "Documents"],
          ["/campus?module=ai", "AI Layer"],
        ],
      },
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
      shellSettingsPromise ||= fetch("/api/settings").then((r) => r.json());
      shellSettingsPromise
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
              {group.items.map(({ href, label, Icon, children }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <div className="nav-item-wrap" key={href}>
                    <Link
                      href={href}
                      className={`nav-item${active ? " active" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <Icon />
                      {label}
                      {children ? <ChevronDownIcon className="nav-parent-chevron" /> : null}
                    </Link>
                    {children && active ? (
                      <div className="nav-submenu">
                        {children.map(([childHref, childLabel]) => (
                          <Link
                            key={childHref}
                            href={childHref}
                            className="nav-subitem"
                            onClick={() => setOpen(false)}
                          >
                            {childLabel}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
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
