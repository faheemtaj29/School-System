"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, Panel, StatusBadge, inputClass } from "@/components/ui";
import { PersonPhoto } from "@/components/PersonPhoto";
import { formatNumber, prettyDate } from "@/lib/types";
import { useSchoolProfile } from "@/lib/useSchoolProfile";

type Teacher = {
  _id: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  joinDate?: string;
  address?: string;
  city?: string;
  qualification?: string;
  fatherName?: string;
  cnic?: string;
  taxNumber?: string;
  designation?: string;
  department?: string;
  experienceYears?: number;
  maritalStatus?: string;
  bloodGroup?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  basicSalary?: number;
  allowances?: number;
  bankName?: string;
  bankAccount?: string;
  status: string;
  branchCode?: string;
  photoUrl: string | null;
  subjects: { _id: string; name: string; code?: string }[];
};

type Payslip = {
  _id: string;
  month: string;
  basic: number;
  allowances: number;
  exemptAllowance?: number;
  taxableIncome?: number;
  incomeTax?: number;
  deductions: number;
  net: number;
  status: string;
  paidOn?: string;
};

type Profile = {
  teacher: Teacher;
  classes: { _id: string; name: string; section?: string; room?: string; students: number }[];
  payslips: Payslip[];
  leaves: { _id: string; leaveType: string; fromDate: string; toDate: string; days: number; status: string; reason?: string }[];
  tax: { yearLabel: string; shownYear: number; yearStartMonth: number; years: { startYear: number; label: string }[]; gross: number; taxable: number; tax: number; net: number };
  canEdit: boolean;
  isSelf: boolean;
};

type Tab = "overview" | "salary" | "classes" | "leaves";

function monthLabel(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="tp-info">
      <span>{label}</span>
      <b>{value === undefined || value === null || value === "" ? "—" : value}</b>
    </div>
  );
}

export default function TeacherProfilePage() {
  const { id } = useParams<{ id: string }>();
  const school = useSchoolProfile();
  const cur = school.currency || "Rs";
  const [data, setData] = useState<Profile | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [year, setYear] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [contact, setContact] = useState({ phone: "", address: "", city: "", emergencyName: "", emergencyPhone: "", bloodGroup: "" });

  const load = useCallback(async () => {
    const res = await fetch(`/api/teachers/${id}/profile`);
    const d = await res.json();
    if (!res.ok) return setErr(d.error || "Could not load profile");
    setData(d);
    setYear((y) => y ?? d.tax.shownYear ?? null);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches data, state is set when it arrives
    load();
  }, [load]);

  if (err) return <EmptyState message={err} />;
  if (!data) return <div className="tp-loading">Loading profile…</div>;
  const t = data.teacher;
  const name = `${t.firstName} ${t.lastName}`;
  const teacherId = t._id;
  const canPhoto = data.canEdit || data.isSelf;

  async function saveContact() {
    const res = await fetch(`/api/teachers/${teacherId}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contact),
    });
    if (res.ok) {
      setEditing(false);
      load();
    }
  }

  // Payslips in the chosen tax year (e.g. Jul 2025 – Jun 2026).
  const slipsInYear = data.payslips.filter((p) => {
    const [y, m] = p.month.split("-").map(Number);
    return year === null || (m >= data.tax.yearStartMonth ? y : y - 1) === year;
  });

  return (
    <>
      <section className="tp-hero">
        <PersonPhoto
          kind="teacher"
          id={teacherId}
          url={t.photoUrl}
          name={name}
          editable={canPhoto}
          onChanged={(url) => setData({ ...data, teacher: { ...t, photoUrl: url } })}
        />
        <div className="tp-hero-main">
          <h1>{name}</h1>
          <p>{t.designation || "Teacher"}{t.department ? ` · ${t.department}` : ""}</p>
          <div className="tp-tags">
            <span>ID {t.employeeId}</span>
            {t.joinDate ? <span>Joined {prettyDate(t.joinDate)}</span> : null}
            {t.qualification ? <span>{t.qualification}</span> : null}
            <StatusBadge status={t.status} />
          </div>
        </div>
        <div className="tp-hero-stats">
          <div><small>Classes</small><b>{data.classes.length}</b></div>
          <div><small>Students</small><b>{data.classes.reduce((s, c) => s + c.students, 0)}</b></div>
          <div><small>Salary paid {data.tax.yearLabel}</small><b>{cur} {formatNumber(data.tax.net)}</b></div>
          <div><small>Tax deducted {data.tax.yearLabel}</small><b>{cur} {formatNumber(data.tax.tax)}</b></div>
        </div>
      </section>

      <div className="chips no-print" style={{ margin: "14px 0" }}>
        {(
          [
            ["overview", "Bio-data"],
            ["salary", "Salary & Tax"],
            ["classes", "Classes & Subjects"],
            ["leaves", "Leaves"],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" className={`filter-chip${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
        {data.canEdit ? (
          <Link href="/teachers" className="filter-chip">Edit in Teachers list</Link>
        ) : null}
      </div>

      {tab === "overview" ? (
        <div className="tp-grid">
          <Panel title="Personal">
            <Info label="Full name" value={name} />
            <Info label="Father / husband" value={t.fatherName} />
            <Info label="Gender" value={t.gender} />
            <Info label="Date of birth" value={t.dateOfBirth ? prettyDate(t.dateOfBirth) : ""} />
            <Info label="CNIC / National ID" value={t.cnic} />
            <Info label="Marital status" value={t.maritalStatus} />
            <Info label="Blood group" value={t.bloodGroup} />
          </Panel>
          <Panel title="Contact" meta={data.isSelf && !editing ? "" : undefined}>
            {editing ? (
              <div className="af-grid">
                {(["phone", "address", "city", "emergencyName", "emergencyPhone", "bloodGroup"] as const).map((k) => (
                  <label key={k}>
                    <span>{{ phone: "Phone", address: "Address", city: "City", emergencyName: "Emergency contact", emergencyPhone: "Emergency phone", bloodGroup: "Blood group" }[k]}</span>
                    <input className={inputClass} value={contact[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })} />
                  </label>
                ))}
                <div className="form-actions">
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                  <button type="button" className="btn-dark" onClick={saveContact}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <Info label="Email" value={t.email} />
                <Info label="Phone" value={t.phone} />
                <Info label="Address" value={[t.address, t.city].filter(Boolean).join(", ")} />
                <Info label="Emergency contact" value={[t.emergencyName, t.emergencyPhone].filter(Boolean).join(" · ")} />
                {data.isSelf ? (
                  <button
                    type="button"
                    className="link-btn no-print"
                    onClick={() => {
                      setContact({
                        phone: t.phone || "",
                        address: t.address || "",
                        city: t.city || "",
                        emergencyName: t.emergencyName || "",
                        emergencyPhone: t.emergencyPhone || "",
                        bloodGroup: t.bloodGroup || "",
                      });
                      setEditing(true);
                    }}
                  >
                    Update my contact details
                  </button>
                ) : null}
              </>
            )}
          </Panel>
          <Panel title="Job">
            <Info label="Employee ID" value={t.employeeId} />
            <Info label="Designation" value={t.designation} />
            <Info label="Department" value={t.department} />
            <Info label="Qualification" value={t.qualification} />
            <Info label="Experience" value={t.experienceYears ? `${t.experienceYears} years` : ""} />
            <Info label="Campus" value={t.branchCode} />
            <Info label="Joined" value={t.joinDate ? prettyDate(t.joinDate) : ""} />
          </Panel>
          <Panel title="Salary & Bank">
            <Info label="Basic salary" value={t.basicSalary ? `${cur} ${formatNumber(t.basicSalary)}` : ""} />
            <Info label="Allowances" value={t.allowances ? `${cur} ${formatNumber(t.allowances)}` : ""} />
            <Info label="Tax no. (NTN / PAN)" value={t.taxNumber} />
            <Info label="Bank" value={t.bankName} />
            <Info label="Account / IBAN" value={t.bankAccount} />
          </Panel>
        </div>
      ) : null}

      {tab === "salary" ? (
        <Panel title="Salary & Tax" meta={`TAX YEAR ${data.tax.years.find((y) => y.startYear === year)?.label || ""}`}>
          <div className="chips no-print" style={{ marginBottom: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Tax year:</span>
            {data.tax.years.map((y) => (
              <button key={y.startYear} type="button" className={`filter-chip${year === y.startYear ? " active" : ""}`} onClick={() => setYear(y.startYear)}>
                {y.label}
              </button>
            ))}
            <button
              type="button"
              className="btn-dark"
              onClick={() => window.open(`/print/tax-certificate?teacher=${teacherId}${year ? `&year=${year}` : ""}`, "_blank")}
            >
              Print tax certificate
            </button>
          </div>
          {!slipsInYear.length ? (
            <EmptyState message="No payslips yet." />
          ) : (
            <div className="table-scroll">
              <table className="reg report-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="right">Basic</th>
                    <th className="right">Allowances</th>
                    <th className="right">Gross</th>
                    <th className="right">Tax-free</th>
                    <th className="right">Taxable</th>
                    <th className="right">Income tax</th>
                    <th className="right">Other deductions</th>
                    <th className="right">Net pay</th>
                    <th className="right">Status</th>
                    <th className="right no-print">Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {slipsInYear.map((p) => (
                    <tr key={p._id}>
                      <td>{monthLabel(p.month)}</td>
                      <td className="num">{formatNumber(p.basic)}</td>
                      <td className="num">{formatNumber(p.allowances)}</td>
                      <td className="num">{formatNumber(p.basic + p.allowances)}</td>
                      <td className="num">{formatNumber(p.exemptAllowance || 0)}</td>
                      <td className="num">{formatNumber(p.taxableIncome || 0)}</td>
                      <td className="num">{formatNumber(p.incomeTax || 0)}</td>
                      <td className="num">{formatNumber(p.deductions)}</td>
                      <td className="num"><strong>{formatNumber(p.net)}</strong></td>
                      <td className="right"><StatusBadge status={p.status} /></td>
                      <td className="right no-print">
                        <button type="button" className="link-btn" onClick={() => window.open(`/print/payslip?id=${p._id}`, "_blank")}>
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="coa-hint">
            Income tax is worked out each month from the yearly tax slabs (set by the school under HR &amp; Payroll):
            the year&apos;s expected tax, less tax already deducted, spread over the months left.
          </p>
        </Panel>
      ) : null}

      {tab === "classes" ? (
        <div className="tp-grid">
          <Panel title="Classes" meta={`${data.classes.length} CLASSES`}>
            {!data.classes.length ? (
              <EmptyState message="No classes assigned." />
            ) : (
              data.classes.map((c) => (
                <div key={c._id} className="tp-info">
                  <span>{c.name}{c.section ? ` – ${c.section}` : ""}{c.room ? ` · Room ${c.room}` : ""}</span>
                  <b>
                    <Link href={`/students?class=${c._id}`}>{c.students} students</Link>
                  </b>
                </div>
              ))
            )}
          </Panel>
          <Panel title="Subjects" meta={`${t.subjects.length} SUBJECTS`}>
            {!t.subjects.length ? (
              <EmptyState message="No subjects assigned." />
            ) : (
              t.subjects.map((s) => <Info key={s._id} label={s.code || ""} value={s.name} />)
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "leaves" ? (
        <Panel title="Leaves" meta={`${data.leaves.length} REQUESTS`}>
          {!data.leaves.length ? (
            <EmptyState message="No leave requests." />
          ) : (
            <table className="reg">
              <thead><tr><th>Type</th><th>From</th><th>To</th><th className="right">Days</th><th>Reason</th><th className="right">Status</th></tr></thead>
              <tbody>
                {data.leaves.map((l) => (
                  <tr key={l._id}>
                    <td style={{ textTransform: "capitalize" }}>{l.leaveType}</td>
                    <td>{prettyDate(l.fromDate)}</td>
                    <td>{prettyDate(l.toDate)}</td>
                    <td className="num">{l.days}</td>
                    <td>{l.reason || ""}</td>
                    <td className="right"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.isSelf ? <p className="coa-hint">Apply for leave under HR &amp; Payroll.</p> : null}
        </Panel>
      ) : null}
    </>
  );
}
