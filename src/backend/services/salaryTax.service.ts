/**
 * Salary income tax: yearly slabs (configurable, with Pakistan and India presets),
 * the tax to deduct from each month's pay, and the yearly certificate for an employee.
 */
import { letterhead } from "@/backend/lib/letterhead";
import { dbConnect } from "@/backend/config/database";
import { Payslip } from "@/backend/models/HR";
import { Settings, type SalaryTaxConfig } from "@/backend/models/Settings";
import { Teacher } from "@/backend/models/Teacher";
import { ServiceError } from "@/backend/types";

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export const SALARY_TAX_PRESETS: Record<string, SalaryTaxConfig & { label: string }> = {
  pakistan_2026_27: {
    preset: "pakistan_2026_27",
    label: "Pakistan — salaried, FY 2026-27 (Jul–Jun)",
    yearStartMonth: 7,
    slabs: [
      { from: 0, rate: 0 },
      { from: 600000, rate: 1 },
      { from: 1200000, rate: 11 },
      { from: 2200000, rate: 20 },
      { from: 3200000, rate: 25 },
      { from: 4100000, rate: 29 },
      { from: 5600000, rate: 32 },
      { from: 7000000, rate: 35 },
    ],
    standardDeduction: 0,
    rebateUpTo: 0,
    cessPercent: 0,
    medicalExemptPercent: 10,
    certificateTitle: "Certificate of Deduction of Income Tax on Salary (Section 149)",
  },
  pakistan_2025_26: {
    preset: "pakistan_2025_26",
    label: "Pakistan — salaried, tax year 2025-26 (Jul–Jun)",
    yearStartMonth: 7,
    slabs: [
      { from: 0, rate: 0 },
      { from: 600000, rate: 1 },
      { from: 1200000, rate: 11 },
      { from: 2200000, rate: 23 },
      { from: 3200000, rate: 30 },
      { from: 4100000, rate: 35 },
    ],
    standardDeduction: 0,
    rebateUpTo: 0,
    cessPercent: 0,
    medicalExemptPercent: 10,
    certificateTitle: "Certificate of Deduction of Income Tax on Salary (Section 149)",
  },
  india_new_2025_26: {
    preset: "india_new_2025_26",
    label: "India — new regime, FY 2025-26 (Apr–Mar)",
    yearStartMonth: 4,
    slabs: [
      { from: 0, rate: 0 },
      { from: 400000, rate: 5 },
      { from: 800000, rate: 10 },
      { from: 1200000, rate: 15 },
      { from: 1600000, rate: 20 },
      { from: 2000000, rate: 25 },
      { from: 2400000, rate: 30 },
    ],
    standardDeduction: 75000,
    rebateUpTo: 1200000,
    cessPercent: 4,
    medicalExemptPercent: 0,
    certificateTitle: "Salary TDS Certificate (Form 16 summary)",
  },
  none: {
    preset: "none",
    label: "No salary tax",
    yearStartMonth: 7,
    slabs: [{ from: 0, rate: 0 }],
    standardDeduction: 0,
    rebateUpTo: 0,
    cessPercent: 0,
    medicalExemptPercent: 0,
    certificateTitle: "Salary Certificate",
  },
};

/** Yearly tax on yearly taxable salary. */
export function yearlyTax(yearlyTaxable: number, cfg: SalaryTaxConfig) {
  const income = Math.max(0, yearlyTaxable - (cfg.standardDeduction || 0));
  if (cfg.rebateUpTo && income <= cfg.rebateUpTo) return 0;
  const slabs = [...cfg.slabs].sort((a, b) => a.from - b.from);
  let tax = 0;
  slabs.forEach((s, i) => {
    const upper = slabs[i + 1]?.from ?? Infinity;
    if (income > s.from) tax += ((Math.min(income, upper) - s.from) * s.rate) / 100;
  });
  return round(tax * (1 + (cfg.cessPercent || 0) / 100));
}

/** The tax year a "YYYY-MM" month falls in, as its starting calendar year. */
export function taxYearOf(month: string, cfg: SalaryTaxConfig) {
  const [y, m] = month.split("-").map(Number);
  return m >= cfg.yearStartMonth ? y : y - 1;
}

/** The twelve "YYYY-MM" months of a tax year. */
export function taxYearMonths(startYear: number, cfg: SalaryTaxConfig) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = ((cfg.yearStartMonth - 1 + i) % 12) + 1;
    const y = startYear + (cfg.yearStartMonth - 1 + i >= 12 ? 1 : 0);
    return `${y}-${String(m).padStart(2, "0")}`;
  });
}

export function taxYearLabel(startYear: number, cfg: SalaryTaxConfig) {
  return cfg.yearStartMonth === 1 ? String(startYear) : `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export const salaryTaxService = {
  presets() {
    return Object.values(SALARY_TAX_PRESETS).map(({ preset, label }) => ({ preset, label }));
  },

  /** Saved rules, or a preset matching the school's currency. */
  async config(): Promise<SalaryTaxConfig> {
    await dbConnect();
    const s = await Settings.findOne().select("salaryTax currency").lean();
    if (s?.salaryTax?.slabs?.length) return s.salaryTax as SalaryTaxConfig;
    const cur = String(s?.currency || "").toUpperCase();
    if (cur.includes("INR") || cur.includes("₹")) return SALARY_TAX_PRESETS.india_new_2025_26;
    if (cur.includes("PKR") || cur === "RS") return SALARY_TAX_PRESETS.pakistan_2026_27;
    return SALARY_TAX_PRESETS.none;
  },

  async saveConfig(input: Partial<SalaryTaxConfig> & { preset?: string; employerTaxNumber?: string }) {
    await dbConnect();
    const base = (input.preset && SALARY_TAX_PRESETS[input.preset]) || (await this.config());
    const cfg: SalaryTaxConfig = {
      preset: input.slabs ? "custom" : base.preset,
      yearStartMonth: Number(input.yearStartMonth ?? base.yearStartMonth),
      slabs: (input.slabs ?? base.slabs)
        .map((s) => ({ from: Math.max(0, Number(s.from) || 0), rate: Math.max(0, Number(s.rate) || 0) }))
        .sort((a, b) => a.from - b.from),
      standardDeduction: Number(input.standardDeduction ?? base.standardDeduction) || 0,
      rebateUpTo: Number(input.rebateUpTo ?? base.rebateUpTo) || 0,
      cessPercent: Number(input.cessPercent ?? base.cessPercent) || 0,
      medicalExemptPercent: Number(input.medicalExemptPercent ?? base.medicalExemptPercent) || 0,
      certificateTitle: String(input.certificateTitle ?? base.certificateTitle),
    };
    if (cfg.yearStartMonth < 1 || cfg.yearStartMonth > 12) {
      throw new ServiceError("VALIDATION", "Tax year must start in month 1–12", 400);
    }
    const set: Record<string, unknown> = { salaryTax: cfg };
    if (input.employerTaxNumber !== undefined) set.employerTaxNumber = input.employerTaxNumber;
    await Settings.updateOne({}, { $set: set }, { upsert: true });
    return cfg;
  },

  /** Default tax-free part of allowances (e.g. medical allowance up to 10% of basic). */
  exemptFor(basic: number, allowances: number, cfg: SalaryTaxConfig) {
    return round(Math.min(allowances, (basic * (cfg.medicalExemptPercent || 0)) / 100));
  },

  /**
   * Tax to deduct this month: the year's projected tax (salary so far plus this month's
   * salary for the rest of the year) less tax already deducted, spread over the months left.
   */
  async monthlyTax(opts: { teacherId: string; month: string; taxable: number; excludeId?: string }) {
    const cfg = await this.config();
    const start = taxYearOf(opts.month, cfg);
    const months = taxYearMonths(start, cfg);
    const index = months.indexOf(opts.month);
    const earlier = await Payslip.find({
      teacherId: opts.teacherId,
      month: { $in: months.slice(0, index) },
      ...(opts.excludeId ? { _id: { $ne: opts.excludeId } } : {}),
    })
      .select("taxableIncome basic allowances exemptAllowance incomeTax")
      .lean();
    const ytdTaxable = earlier.reduce(
      (t, p) => t + (p.taxableIncome ?? Math.max(0, (p.basic || 0) + (p.allowances || 0) - (p.exemptAllowance || 0))),
      0
    );
    const ytdTax = earlier.reduce((t, p) => t + (p.incomeTax || 0), 0);
    const remaining = 12 - index;
    const projected = ytdTaxable + opts.taxable * remaining;
    return round(Math.max(0, (yearlyTax(projected, cfg) - ytdTax) / remaining));
  },

  /** Yearly salary & tax certificate for one employee. */
  async certificate(teacherId: string, startYear?: number) {
    await dbConnect();
    const cfg = await this.config();
    const now = new Date();
    const year = startYear ?? taxYearOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, cfg);
    const months = taxYearMonths(year, cfg);
    const [teacher, slips, s] = await Promise.all([
      Teacher.findById(teacherId)
        .select("firstName lastName employeeId cnic taxNumber designation address city joinDate photoUpdatedAt")
        .lean(),
      Payslip.find({ teacherId, month: { $in: months } }).sort({ month: 1 }).lean(),
      Settings.findOne()
        .select("schoolName address phone email currency logoUpdatedAt registrationNo employerTaxNumber")
        .lean(),
    ]);
    if (!teacher) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    const head = await letterhead((teacher as { branchCode?: string }).branchCode);
    const rows = months.map((month) => {
      const p = slips.find((x) => x.month === month);
      const gross = p ? round((p.basic || 0) + (p.allowances || 0)) : 0;
      const exempt = p ? round(p.exemptAllowance || 0) : 0;
      return {
        month,
        basic: p ? p.basic : 0,
        allowances: p ? p.allowances : 0,
        gross,
        exempt,
        taxable: p ? round(p.taxableIncome ?? Math.max(0, gross - exempt)) : 0,
        tax: p ? round(p.incomeTax || 0) : 0,
        status: p?.status || "",
      };
    });
    const sum = (k: "basic" | "allowances" | "gross" | "exempt" | "taxable" | "tax") =>
      round(rows.reduce((t, r) => t + Number(r[k] || 0), 0));
    const taxable = sum("taxable");
    return {
      title: cfg.certificateTitle,
      taxYear: taxYearLabel(year, cfg),
      startYear: year,
      period: { from: months[0], to: months[11] },
      rules: cfg,
      teacher: {
        name: `${teacher.firstName} ${teacher.lastName}`,
        employeeId: teacher.employeeId,
        cnic: teacher.cnic || "",
        taxNumber: teacher.taxNumber || "",
        designation: teacher.designation || "Teacher",
        address: [teacher.address, teacher.city].filter(Boolean).join(", "),
      },
      // The teacher's campus letterhead; the employer tax number is the school's.
      employer: {
        name: head.name,
        campus: head.campus,
        address: head.address,
        phone: head.phone,
        email: head.email,
        taxNumber: s?.employerTaxNumber || s?.registrationNo || "",
        currency: head.currency,
        logoUrl: head.logoUrl,
      },
      rows,
      totals: {
        basic: sum("basic"),
        allowances: sum("allowances"),
        gross: sum("gross"),
        exempt: sum("exempt"),
        taxable,
        tax: sum("tax"),
      },
      taxOnYear: yearlyTax(taxable, cfg),
    };
  },
};
