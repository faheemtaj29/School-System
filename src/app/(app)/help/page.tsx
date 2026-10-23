"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/* ── types ─────────────────────────────────────────────────────── */
type Step = { text: string; tip?: string };
type Guide = {
  id: string;
  title: string;
  category: string;
  icon: string;
  summary: string;
  steps: Step[];
  path?: string;
};

/* ── guide data ─────────────────────────────────────────────────── */
const guides: Guide[] = [
  // ── GETTING STARTED ─────────────────────────────────────────────
  {
    id: "first-setup",
    category: "Getting Started",
    icon: "🚀",
    title: "First-time Setup",
    summary: "Configure your school profile before doing anything else.",
    steps: [
      { text: "Go to Settings (bottom of sidebar)", tip: "Admin only" },
      { text: "Fill in School Name, address, phone, email and upload your school logo" },
      { text: "Add your campuses / branches under the Campuses tab" },
      { text: "Set up fee head labels (e.g. Tuition, Transport) under Lists tab" },
      { text: "Save — your school name and logo will now appear on all printed documents" },
    ],
    path: "/settings",
  },
  {
    id: "create-class",
    category: "Getting Started",
    icon: "🏫",
    title: "Create Classes & Sections",
    summary: "You must create at least one class before enrolling students.",
    steps: [
      { text: "Go to Classes & Sections in the sidebar" },
      { text: "Click Add Class — enter name (e.g. Grade 5), section (A), academic year" },
      { text: "You can add multiple sections for the same grade (A, B, C…)" },
      { text: "Under Academic Sessions tab, create the current academic session (e.g. 2025-26)" },
    ],
    path: "/classes",
  },
  {
    id: "add-subjects",
    category: "Getting Started",
    icon: "📚",
    title: "Add Subjects",
    summary: "Add subjects before assigning them to teachers.",
    steps: [
      { text: "Go to Subjects in the sidebar" },
      { text: "Click Add Subject — enter name, code and optionally credit hours" },
      { text: "Add all subjects (English, Urdu, Maths, Science, etc.)" },
    ],
    path: "/subjects",
  },

  // ── STUDENTS ─────────────────────────────────────────────────────
  {
    id: "admit-student",
    category: "Students",
    icon: "👤",
    title: "Admit a New Student",
    summary: "Full admission process — personal info, class assignment and optional fee challan.",
    steps: [
      { text: "Go to Students → click Add Student" },
      { text: "Fill Personal Information: name, gender, date of birth, CNIC / B-Form number, address, phone" },
      { text: "Fill Academic Details: select class, set admission date and roll number" },
      { text: "Fill Guardian Contact: parent name, phone, email" },
      { text: "Optional — Fee Concession: select discount type if applicable (teacher child, sibling, merit, etc.)" },
      { text: "Optional — Admission Fees section at bottom: add fee heads (e.g. Admission Fee, Tuition) with amounts and a due date", tip: "This auto-generates the first fee voucher on enrolment" },
      { text: "Click Enroll Student — student is saved and fee challan is created (if you added fee lines)" },
    ],
    path: "/students",
  },
  {
    id: "student-profile",
    category: "Students",
    icon: "📋",
    title: "View Student Profile",
    summary: "See a student's complete record: fees, exam results and personal details.",
    steps: [
      { text: "Go to Students page" },
      { text: "Find the student and click Profile in the Actions column" },
      { text: "Overview tab: personal details, guardian info, fee and academic snapshots" },
      { text: "Fees tab: all fee vouchers with status (paid / pending / overdue)" },
      { text: "Academics tab: all exam results with marks and percentage for this student" },
    ],
    path: "/students",
  },
  {
    id: "admit-doc",
    category: "Students",
    icon: "🖨️",
    title: "Print Admission Form / TC",
    summary: "Print the official admission form or transfer certificate for a student.",
    steps: [
      { text: "Go to Students page" },
      { text: "Click Docs in the Actions column next to the student" },
      { text: "Admission Form tab: shows the filled admission form — click Print Admission Form" },
      { text: "TC tab: if a TC has been issued, shows it — click Print TC" },
      { text: "To issue a TC: click TC tab → fill leaving date, reason, conduct → Issue Certificate", tip: "TC number is auto-generated" },
    ],
    path: "/students",
  },
  {
    id: "promote-students",
    category: "Students",
    icon: "⬆️",
    title: "Promote Students to Next Class",
    summary: "Auto-promote passed students at year end.",
    steps: [
      { text: "Go to Students page" },
      { text: "Filter to a specific class using the class chips" },
      { text: "The Auto-Promote panel appears — click Preview to see who passes (≥40% in final exam)" },
      { text: "Review the preview, then click Promote passed students to move them to the next class" },
      { text: "Students at the top of the ladder are marked Graduated" },
    ],
    path: "/students",
  },

  // ── FEES ─────────────────────────────────────────────────────────
  {
    id: "generate-fees",
    category: "Fees",
    icon: "💵",
    title: "Generate Fee Challans (Bulk)",
    summary: "Create fee vouchers for an entire class or the whole school.",
    steps: [
      { text: "Go to Fee Vouchers in the sidebar" },
      { text: "Click Generate Fees tab" },
      { text: "Select Apply to Class / Section and choose the class" },
      { text: "Set a Due Date for the vouchers" },
      { text: "Add fee heads: click in the Fee Head field and select (or type a new one), enter amount" },
      { text: "Click Generate Fee Challans — one voucher is created per student in that class" },
      { text: "Discount concessions are applied automatically based on each student's concession type" },
    ],
    path: "/fees",
  },
  {
    id: "collect-fee",
    category: "Fees",
    icon: "✅",
    title: "Mark a Fee as Collected",
    summary: "Record a payment when a student pays their fee.",
    steps: [
      { text: "Go to Fee Vouchers → click Pending tab" },
      { text: "Find the student's voucher — click Mark Paid" },
      { text: "Enter the Amount Paid, Payment Method (cash/bank/online/card) and Payment Date" },
      { text: "Click Confirm — the voucher status changes to Paid (or Partial if only partially paid)" },
    ],
    path: "/fees",
  },
  {
    id: "fee-voucher-print",
    category: "Fees",
    icon: "🖨️",
    title: "Print a Fee Voucher / Challan",
    summary: "Print or share the fee challan with a student.",
    steps: [
      { text: "Go to Fee Vouchers — find any voucher in Pending or All Vouchers tab" },
      { text: "Click Voucher in the Actions column" },
      { text: "The challan preview appears — click Print to print it" },
      { text: "Click Share on WhatsApp to send the challan text to the parent via WhatsApp" },
    ],
    path: "/fees",
  },
  {
    id: "late-fees",
    category: "Fees",
    icon: "⏰",
    title: "Apply Late Fee Penalty",
    summary: "Automatically add a late fee % on overdue vouchers.",
    steps: [
      { text: "Go to Fee Vouchers" },
      { text: "Click Apply Late Fees button in the stats bar" },
      { text: "The system adds the configured late fee % on all overdue vouchers" },
      { text: "To configure the late fee %, go to Settings → Fee Settings" },
    ],
    path: "/fees",
  },

  // ── ATTENDANCE ────────────────────────────────────────────────────
  {
    id: "mark-attendance",
    category: "Attendance",
    icon: "📅",
    title: "Mark Daily Attendance",
    summary: "Record present / absent / late / excused for a class.",
    steps: [
      { text: "Go to Attendance in the sidebar" },
      { text: "Select the class and date (today is pre-filled)" },
      { text: "Click Load Students — all students in that class appear" },
      { text: "For each student, click Present, Absent, Late or Excused" },
      { text: "Optionally add a note for any student" },
      { text: "Click Save Attendance — the sheet is stored" },
    ],
    path: "/attendance",
  },

  // ── EXAMS ─────────────────────────────────────────────────────────
  {
    id: "create-exam",
    category: "Exams",
    icon: "📝",
    title: "Create an Exam & Enter Marks",
    summary: "Record a test or exam with marks for each student.",
    steps: [
      { text: "Go to Exams & Results → click Add Exam" },
      { text: "Select Class, Subject, Exam Type (quiz, mid-term, final…), Date and Max Marks" },
      { text: "Optionally assign a Teacher" },
      { text: "Click Create — the exam row appears" },
      { text: "Click Edit on the exam → enter marks for each student" },
      { text: "Save — results are now visible in student profiles and reports" },
    ],
    path: "/exams",
  },
  {
    id: "marksheet",
    category: "Exams",
    icon: "📊",
    title: "Fill the Class Marksheet",
    summary: "Enter marks for all subjects and students in a grid.",
    steps: [
      { text: "Go to Exams & Results → click Marksheet tab" },
      { text: "Select the class — a grid of students × subjects appears" },
      { text: "Click on any cell to enter marks (theory, viva, assignment, attendance, project)" },
      { text: "Click Save Marksheet — all marks are saved at once" },
    ],
    path: "/exams",
  },
  {
    id: "result-cards",
    category: "Exams",
    icon: "🏆",
    title: "Print Result Cards",
    summary: "Generate and print individual result cards for students.",
    steps: [
      { text: "Go to Reports & Print in the sidebar" },
      { text: "Select Result Cards report type" },
      { text: "Filter by class and exam type" },
      { text: "Preview — result cards are shown for all students" },
      { text: "Print one card using the per-card Print button, or Print All to print all cards" },
      { text: "Share via WhatsApp using the Share button next to each card" },
    ],
    path: "/reports",
  },

  // ── TEACHERS ─────────────────────────────────────────────────────
  {
    id: "add-teacher",
    category: "Teachers & Staff",
    icon: "👩‍🏫",
    title: "Add a Teacher",
    summary: "Add teaching staff and assign subjects and classes.",
    steps: [
      { text: "Go to Teachers in the sidebar → click Add Staff" },
      { text: "Fill personal and contact details" },
      { text: "Assign Subjects the teacher teaches (multi-select)" },
      { text: "Assign Classes they manage" },
      { text: "Click Create — teacher is added" },
      { text: "Click Portal Login in the Actions column to create their login credentials" },
    ],
    path: "/teachers",
  },

  // ── HR ────────────────────────────────────────────────────────────
  {
    id: "payroll",
    category: "HR & Payroll",
    icon: "💰",
    title: "Generate Monthly Payslips",
    summary: "Create payslips for all teachers and staff.",
    steps: [
      { text: "Go to HR & Payroll in the sidebar → click Payroll tab" },
      { text: "Select the month and click Generate Payroll — payslips are created for all active employees" },
      { text: "Review individual payslips — click Disburse to mark a payslip as paid" },
      { text: "Use Print to print the payslip" },
    ],
    path: "/hr",
  },
  {
    id: "leave",
    category: "HR & Payroll",
    icon: "📆",
    title: "Manage Leave Requests",
    summary: "Review and approve or reject employee leave applications.",
    steps: [
      { text: "Go to HR & Payroll → click Leave tab" },
      { text: "Pending leave requests appear — click Approve or Reject for each" },
      { text: "Employees can submit their own leave requests from their Teacher portal" },
    ],
    path: "/hr",
  },

  // ── REPORTS ───────────────────────────────────────────────────────
  {
    id: "reports",
    category: "Reports",
    icon: "📈",
    title: "Generate & Print Reports",
    summary: "Attendance summary, fee collection report, exam results and more.",
    steps: [
      { text: "Go to Reports & Print in the sidebar" },
      { text: "Select the report type from the list (Attendance, Fee Collection, Result Cards, etc.)" },
      { text: "Set the filters (date range, class, exam type) and click Generate" },
      { text: "Preview appears — click Print to print it or export as needed" },
    ],
    path: "/reports",
  },

  // ── SETTINGS ──────────────────────────────────────────────────────
  {
    id: "portal-login",
    category: "Settings & Access",
    icon: "🔑",
    title: "Create Portal Login for Student / Teacher / Staff",
    summary: "Give a user access to their own portal.",
    steps: [
      { text: "Go to the relevant page (Students, Teachers, or Campus Staff)" },
      { text: "Find the person in the list — click Portal Login in the Actions column" },
      { text: "Set their email and a temporary password — click Create" },
      { text: "The user can now log in at the school's login page with those credentials" },
    ],
    path: "/students",
  },
  {
    id: "custom-fields",
    category: "Settings & Access",
    icon: "🔧",
    title: "Add Custom Fields to Student / Teacher Forms",
    summary: "Create your own fields for extra information.",
    steps: [
      { text: "Go to Settings → Platform tab" },
      { text: "Under Custom Fields, select the entity (Student or Teacher)" },
      { text: "Click Add Field — enter label, type (text, number, select, date) and options if select type" },
      { text: "Save — the field appears in the relevant form and is stored on each record" },
    ],
    path: "/settings",
  },
];

/* ── categories ─────────────────────────────────────────────────── */
const ALL_CATS = ["All", ...Array.from(new Set(guides.map((g) => g.category)))];

/* ══════════════════════════════════════════════════════════════════ */
export default function HelpPage() {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<string | null>("admit-student");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return guides.filter((g) => {
      const matchCat = cat === "All" || g.category === cat;
      const matchQ = !q || g.title.toLowerCase().includes(q) || g.summary.toLowerCase().includes(q) ||
        g.steps.some((s) => s.text.toLowerCase().includes(q));
      return matchCat && matchQ;
    });
  }, [search, cat]);

  return (
    <>
      {/* Hero */}
      <div className="hero">
        <div className="hero-text">
          <h1>Help &amp; User Guide</h1>
          <div className="sub">
            Step-by-step workflows for every module in EduCore
            <span className="live">QUICK START</span>
          </div>
        </div>
      </div>

      {/* Search + category filter */}
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <input
          type="search"
          className="inp"
          placeholder="Search guides…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <div className="chips">
          {ALL_CATS.map((c) => (
            <button
              key={c}
              type="button"
              className={`filter-chip${cat === c ? " active" : ""}`}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow banner — first-time */}
      <div style={{
        margin: "16px 24px 0",
        padding: "16px 20px",
        background: "linear-gradient(135deg, var(--primary) 0%, #0d6652 100%)",
        borderRadius: 12,
        color: "#fff",
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 28 }}>💡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Recommended Setup Order</div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>
            Settings → Classes → Subjects → Teachers → Students → Fees → Attendance → Exams → Reports
          </div>
        </div>
      </div>

      {/* Guide list */}
      {filtered.length === 0 ? (
        <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--text-dim)", fontSize: 14 }}>
          No guides match &ldquo;{search}&rdquo;
        </div>
      ) : (
        <div style={{ margin: "16px 24px 40px", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Group by category */}
          {ALL_CATS.filter((c) => c !== "All").map((c) => {
            const catGuides = filtered.filter((g) => g.category === c);
            if (!catGuides.length) return null;
            return (
              <div key={c}>
                {(cat === "All" || cat === c) ? (
                  <div style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".08em", color: "var(--text-dim)",
                    padding: "16px 0 6px",
                    borderBottom: "1px solid var(--line)",
                    marginBottom: 8,
                  }}>
                    {c}
                  </div>
                ) : null}
                {catGuides.map((g) => (
                  <GuideCard
                    key={g.id}
                    guide={g}
                    isOpen={open === g.id}
                    onToggle={() => setOpen(open === g.id ? null : g.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── GuideCard ───────────────────────────────────────────────────── */
function GuideCard({ guide, isOpen, onToggle }: { guide: Guide; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{
      background: "var(--card)",
      border: `1px solid ${isOpen ? "var(--primary)" : "var(--line)"}`,
      borderRadius: 10,
      overflow: "clip",
      transition: "border-color .15s",
    }}>
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%", textAlign: "left", padding: "14px 18px",
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12,
        }}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>{guide.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{guide.title}</div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{guide.summary}</div>
        </div>
        <span style={{
          fontSize: 18, color: "var(--text-dim)", flexShrink: 0,
          transform: isOpen ? "rotate(90deg)" : "none",
          transition: "transform .15s",
          display: "inline-block",
        }}>›</span>
      </button>

      {/* Steps */}
      {isOpen ? (
        <div style={{
          padding: "4px 18px 18px 18px",
          borderTop: "1px solid var(--line)",
          background: "var(--surface)",
        }}>
          <ol style={{ paddingLeft: 20, margin: "14px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
            {guide.steps.map((step, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.6 }}>
                <span>{step.text}</span>
                {step.tip ? (
                  <span style={{
                    display: "inline-block", marginLeft: 8,
                    padding: "1px 8px", borderRadius: 99,
                    background: "var(--primary)", color: "#fff",
                    fontSize: 11, fontWeight: 600, verticalAlign: "middle",
                  }}>{step.tip}</span>
                ) : null}
              </li>
            ))}
          </ol>
          {guide.path ? (
            <div style={{ marginTop: 14 }}>
              <Link
                href={guide.path}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 16px", borderRadius: 8,
                  background: "var(--primary)", color: "#fff",
                  fontSize: 12, fontWeight: 600, textDecoration: "none",
                }}
              >
                Go to {guide.title.split(" ").slice(-1)[0]} →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
