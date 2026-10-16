"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

type NavSubItem = { href: string; label: string };
type NavTree = {
  key: "accounting" | "inventory";
  sections: { label: string; items: NavSubItem[] }[];
};

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  roles?: string[];
  tree?: NavTree;
};

type NavGroup = { label: string; items: NavItem[] };

/** `roles` limits an entry; leaving it out means every signed-in role sees it. */
const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", Icon: DashboardIcon },
      { href: "/reports", label: "Reports & Print", Icon: ReportsIcon, roles: ["admin", "teacher", "student", "parent"] },
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
      {
        href: "/accounting",
        label: "Accounting",
        Icon: AccountingIcon,
        roles: ["admin"],
        tree: {
          key: "accounting",
          sections: [
            {
              label: "Overview",
              items: [{ href: "/accounting?tab=overview&node=accounting-dashboard", label: "Dashboard" }],
            },
            {
              label: "Vouchers",
              items: [
                { href: "/accounting?tab=vouchers&type=payment&mode=cash_payment&node=cpv", label: "Cash Payment Voucher" },
                { href: "/accounting?tab=vouchers&type=payment&mode=bank_payment&node=bpv", label: "Bank Payment Voucher" },
                { href: "/accounting?tab=vouchers&type=receipt&mode=cash_receipt&node=crv", label: "Cash Receipt Voucher" },
                { href: "/accounting?tab=vouchers&type=receipt&mode=bank_receipt&node=brv", label: "Bank Receipt Voucher" },
                { href: "/accounting?tab=vouchers&type=journal&node=jv", label: "Journal Entry" },
                { href: "/accounting?tab=vouchers&type=contra&node=cv", label: "Contra Entry" },
                { href: "/accounting?tab=vouchers&type=payment&mode=expense&node=expv", label: "Expense Voucher" },
              ],
            },
            {
              label: "Ledgers",
              items: [
                { href: "/accounting?tab=coa&node=chart-of-accounts", label: "Chart of Accounts" },
                { href: "/accounting?tab=ledger&node=party-ledger", label: "Party Ledger" },
                { href: "/accounting?tab=ledger&node=general-ledger", label: "General Ledger" },
                { href: "/accounting?tab=daybook&mode=cash_book&node=cash-book", label: "Cash Book" },
                { href: "/accounting?tab=daybook&mode=bank_book&node=bank-book", label: "Bank Book" },
              ],
            },
            {
              label: "Reports",
              items: [
                { href: "/accounting?tab=trial&node=trial-balance", label: "Trial Balance" },
                { href: "/accounting?tab=pnl&node=income-statement", label: "Income Statement" },
                { href: "/accounting?tab=balance&node=balance-sheet", label: "Balance Sheet" },
                { href: "/accounting?tab=bank&node=bank-reconciliation", label: "Bank Reconciliation" },
                { href: "/accounting?tab=overview&node=accounting-reports", label: "Accounting Reports" },
              ],
            },
          ],
        },
      },
      {
        href: "/inventory",
        label: "Inventory",
        Icon: InventoryIcon,
        roles: ["admin", "staff"],
        tree: {
          key: "inventory",
          sections: [
            {
              label: "Master",
              items: [
                { href: "/inventory?tab=vouchers&node=inventory-dashboard", label: "Dashboard" },
                { href: "/inventory?tab=products&node=products", label: "Products" },
                { href: "/inventory?tab=products&node=categories", label: "Categories" },
                { href: "/inventory?tab=products&node=warehouses", label: "Warehouses" },
              ],
            },
            {
              label: "Transactions",
              items: [
                { href: "/inventory?tab=vouchers&type=purchase&node=purchase", label: "Purchase" },
                { href: "/inventory?tab=vouchers&type=purchase_return&node=purchase-return", label: "Purchase Return" },
                { href: "/inventory?tab=vouchers&type=sales&node=sales", label: "Sales" },
                { href: "/inventory?tab=vouchers&type=sales_return&node=sales-return", label: "Sales Return" },
                { href: "/inventory?tab=vouchers&type=adjustment&node=stock-adjustment", label: "Stock Adjustment" },
                { href: "/inventory?tab=vouchers&type=transfer&node=stock-transfer", label: "Stock Transfer" },
              ],
            },
            {
              label: "Ledgers & Reports",
              items: [
                { href: "/inventory?tab=products&node=product-ledger", label: "Product Ledger" },
                { href: "/inventory?tab=vouchers&node=stock-ledger", label: "Stock Ledger" },
                { href: "/inventory?tab=vouchers&node=stock-movement", label: "Stock Movement" },
                { href: "/inventory?tab=products&node=barcode", label: "Barcode Generation" },
                { href: "/inventory?tab=vouchers&node=inventory-reports", label: "Inventory Reports" },
              ],
            },
          ],
        },
      },
      { href: "/campus", label: "Campus Ops", Icon: InventoryIcon, roles: ["admin", "staff", "teacher"] },
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<{ code: string; name: string }[]>([
    { code: "MAIN", name: "Main Campus" },
  ]);
  const [campus, setCampus] = useState("MAIN");
  const [academicYear, setAcademicYear] = useState("");
  const [expandedTrees, setExpandedTrees] = useState({ accounting: false, inventory: false });
  const currentRole = (user.role || "").toLowerCase();

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.roles || item.roles.some((role) => role.toLowerCase() === currentRole)
      ),
    }))
    .filter((group) => group.items.length);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedTrees((prev) => ({
      accounting: prev.accounting || pathname.startsWith("/accounting"),
      inventory: prev.inventory || pathname.startsWith("/inventory"),
    }));
  }, [pathname]);

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

  function hrefActive(href: string) {
    const [path, rawQuery = ""] = href.split("?");
    if (!(pathname === path || pathname.startsWith(`${path}/`))) return false;
    if (!rawQuery) return pathname === path;
    const qp = new URLSearchParams(rawQuery);
    for (const [key, value] of qp.entries()) {
      if (searchParams.get(key) !== value) return false;
    }
    return true;
  }

  function renderTree(item: NavItem) {
    if (!item.tree) return null;
    const isExpanded = expandedTrees[item.tree.key];
    const isActive =
      pathname === item.href ||
      pathname.startsWith(`${item.href}/`) ||
      item.tree.sections.some((section) => section.items.some((sub) => hrefActive(sub.href)));

    return (
      <div className="nav-tree-wrap" key={item.href}>
        <button
          type="button"
          className={`nav-item nav-tree-btn${isActive ? " active" : ""}`}
          onClick={() =>
            setExpandedTrees((prev) => ({
              ...prev,
              [item.tree!.key]: !prev[item.tree!.key],
            }))
          }
        >
          <item.Icon />
          <span>{item.label}</span>
          <ChevronDownIcon className={`tree-caret${isExpanded ? " open" : ""}`} />
        </button>
        {isExpanded ? (
          <div className="nav-subtree">
            {item.tree.sections.map((section) => (
              <div className="nav-subsection" key={section.label}>
                <div className="nav-sublabel">{section.label}</div>
                {section.items.map((sub) => (
                  <Link
                    key={sub.href}
                    href={sub.href}
                    className={`nav-subitem${hrefActive(sub.href) ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    {sub.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
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
              {group.items.map((item) => {
                if (item.tree) return renderTree(item);
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-item${active ? " active" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <item.Icon />
                    {item.label}
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
