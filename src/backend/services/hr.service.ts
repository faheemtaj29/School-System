import { dbConnect } from "@/backend/config/database";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { ServiceError, type SessionUser } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type { leaveSchema } from "@/backend/validators/modules.validator";
import { payslipSchema } from "@/backend/validators/modules.validator";
import { accountingService } from "@/backend/services/accounting.service";
import { platformService } from "@/backend/services/platform.service";
import { salaryTaxService, taxYearLabel, taxYearMonths, taxYearOf } from "@/backend/services/salaryTax.service";
import { letterhead } from "@/backend/lib/letterhead";
import { Teacher } from "@/backend/models/Teacher";
import { Staff } from "@/backend/models/Staff";
import { Voucher } from "@/backend/models/Accounting";

type LeaveInput = z.infer<typeof leaveSchema>;
type PayslipInput = z.infer<typeof payslipSchema>;

/** The person a payslip is for — a teacher, or a campus staff member (payslip.teacherId holds either). */
async function employeeOf(slip: { teacherId: unknown; employeeModel?: string }, select = "firstName lastName") {
  const M = slip.employeeModel === "Staff" ? Staff : Teacher;
  return M.findById(slip.teacherId).select(select).lean();
}

/** The salary journal (PAY-… voucher) of each payslip that has been paid. */
async function voucherNumbers(ids: string[]) {
  const vs = await Voucher.find({ sourceType: "payslip", sourceId: { $in: ids }, status: "posted" }).select("number sourceId").lean();
  return new Map(vs.map((v: { sourceId: string; number: string; _id: unknown }) => [String(v.sourceId), { number: v.number, id: String(v._id) }]));
}

/**
 * A paid payslip posts: Dr Salaries (gross), Cr Bank (net pay), Cr Salary tax withheld,
 * Cr Payroll deductions — so the tax shows as owed to the government until deposited.
 */
async function syncPayslipLedger(slip: {
  _id: { toString(): string };
  month: string;
  basic: number;
  allowances: number;
  deductions: number;
  incomeTax?: number;
  net: number;
  status: string;
  paidOn?: Date | null;
  branchCode?: string;
  paymentMethod?: string;
  teacherId: unknown;
  employeeModel?: string;
}) {
  const id = String(slip._id);
  await accountingService.removeBySource("payslip", id);
  if (slip.status !== "paid" || slip.net <= 0) return;
  const gross = Math.round((slip.basic + slip.allowances) * 100) / 100;
  const cash = slip.paymentMethod === "cash";
  const [expense, bank, taxPayable, deductions] = await Promise.all([
    accountingService.ensureAccount({ systemKey: "payrollExpense", code: "51010101", name: "Salaries & Wages", type: "expense", level: 5, parentCode: "510101", isPosting: true }),
    cash
      ? accountingService.ensureAccount({ systemKey: "cash", code: "11010101", name: "Cash in Hand", type: "asset", level: 5, parentCode: "110101", isPosting: true })
      : accountingService.ensureAccount({ systemKey: "bank", code: "11010102", name: "Main Bank Account", type: "asset", level: 5, parentCode: "110101", isPosting: true }),
    accountingService.ensureAccount({ systemKey: "salaryTaxPayable", code: "21020102", name: "Income Tax Withheld on Salaries", type: "liability", level: 5, parentCode: "210201", isPosting: true }),
    accountingService.ensureAccount({ systemKey: "payrollDeductions", code: "21010102", name: "Payroll Deductions Payable", type: "liability", level: 5, parentCode: "210101", isPosting: true }),
  ]);
  const person = await employeeOf(slip);
  const who = person ? `${person.firstName} ${person.lastName}` : "Staff";
  await accountingService.postLinkedJournal({
    series: "PAY",
    sourceType: "payslip",
    sourceId: id,
    date: slip.paidOn || new Date(),
    branchCode: slip.branchCode || "MAIN",
    narration: `Salary ${slip.month} — ${who}`,
    reference: `PAY-${slip.month}`,
    partyName: who,
    lines: [
      { accountCode: expense.code as string, debit: gross, credit: 0, narration: `Gross salary ${slip.month}` },
      { accountCode: bank.code as string, debit: 0, credit: slip.net, narration: cash ? "Net pay in cash" : "Net pay by bank" },
      { accountCode: taxPayable.code as string, debit: 0, credit: slip.incomeTax || 0, narration: "Salary tax withheld" },
      { accountCode: deductions.code as string, debit: 0, credit: slip.deductions || 0, narration: "Other deductions" },
    ],
  });
}

/** Works out exempt allowance, taxable salary, income tax and net pay for a payslip. */
async function payFigures(data: PayslipInput, excludeId?: string) {
  const cfg = await salaryTaxService.config();
  const exemptAllowance = Math.min(
    data.allowances,
    data.exemptAllowance ?? salaryTaxService.exemptFor(data.basic, data.allowances, cfg)
  );
  const gross = data.basic + data.allowances;
  const taxableIncome = Math.max(0, gross - exemptAllowance);
  const incomeTax =
    data.incomeTax ??
    (await salaryTaxService.monthlyTax({ teacherId: data.teacherId, month: data.month, taxable: taxableIncome, excludeId }));
  if (data.deductions + incomeTax > gross) {
    throw new ServiceError("VALIDATION", "Tax plus deductions cannot be more than the gross salary.", 400);
  }
  return { exemptAllowance, taxableIncome, incomeTax, net: Math.round((gross - data.deductions - incomeTax) * 100) / 100 };
}

export const hrService = {
  async listLeaves() {
    await dbConnect();
    return LeaveRequest.find()
      .populate("teacherId", "firstName lastName employeeId branchCode photoUpdatedAt")
      .sort({ createdAt: -1 })
      .lean();
  },

  async listLeavesForTeacher(teacherId: string) {
    await dbConnect();
    return LeaveRequest.find({ teacherId })
      .populate("teacherId", "firstName lastName employeeId branchCode photoUpdatedAt")
      .sort({ createdAt: -1 })
      .lean();
  },

  async createLeave(data: LeaveInput, session?: SessionUser | null) {
    await dbConnect();
    const leave = await LeaveRequest.create({
      ...data,
      fromDate: new Date(data.fromDate),
      toDate: new Date(data.toDate),
    });
    if (session) {
      try {
        await platformService.seedDefaults();
        await platformService.startWorkflow(
          {
            workflowCode: "LEAVE",
            subjectType: "leave",
            subjectId: String(leave._id),
            title: `Leave · ${data.leaveType} · ${data.days} day(s)`,
            payload: {
              leaveType: data.leaveType,
              fromDate: data.fromDate,
              toDate: data.toDate,
              days: data.days,
              reason: data.reason,
            },
            note: data.reason,
          },
          session
        );
      } catch {
        /* leave still saved if workflow seed missing */
      }
    }
    return leave;
  },

  async updateLeaveStatus(id: string, status: "pending" | "approved" | "rejected", userId?: string) {
    await dbConnect();
    const item = await LeaveRequest.findByIdAndUpdate(
      id,
      { status, reviewedBy: userId || undefined },
      { new: true }
    ).populate("teacherId", "firstName lastName employeeId");
    if (!item) throw new ServiceError("NOT_FOUND", "Leave request not found", 404);
    return item;
  },

  async removeLeave(id: string) {
    await dbConnect();
    const item = await LeaveRequest.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Leave request not found", 404);
    return { ok: true };
  },

  async listPayslips() {
    await dbConnect();
    const slips = await Payslip.find()
      .populate("teacherId", "firstName lastName employeeId email branchCode photoUpdatedAt designation")
      .sort({ month: -1 })
      .lean();
    const numbers = await voucherNumbers(slips.map((s: { _id: unknown }) => String(s._id)));
    return slips.map((s: { _id: unknown }) => ({ ...s, voucher: numbers.get(String(s._id)) || null }));
  },

  async listPayslipsForTeacher(teacherId: string) {
    await dbConnect();
    return Payslip.find({ teacherId })
      .populate("teacherId", "firstName lastName employeeId email branchCode photoUpdatedAt")
      .sort({ month: -1 })
      .lean();
  },

  async createPayslip(data: PayslipInput) {
    await dbConnect();
    if (!(await employeeOf(data))) throw new ServiceError("NOT_FOUND", "Employee not found", 404);
    const figures = await payFigures(data);
    let slip;
    try {
      slip = await Payslip.create({
        ...data,
        ...figures,
        branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
        paidOn: parseOptionalDate(data.paidOn ?? undefined),
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      ) {
        throw new ServiceError(
          "CONFLICT",
          "A payslip already exists for this person and month.",
          409
        );
      }
      throw error;
    }
    await syncPayslipLedger(slip);
    return slip;
  },

  async updatePayslip(id: string, data: PayslipInput) {
    await dbConnect();
    const figures = await payFigures(data, id);
    let item;
    try {
      item = await Payslip.findByIdAndUpdate(
        id,
        {
          ...data,
          ...figures,
          branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
          paidOn: parseOptionalDate(data.paidOn ?? undefined),
        },
        { new: true, runValidators: true }
      ).populate("teacherId", "firstName lastName employeeId email");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 11000
      ) {
        throw new ServiceError(
          "CONFLICT",
          "A payslip already exists for this person and month.",
          409
        );
      }
      throw error;
    }
    if (!item) throw new ServiceError("NOT_FOUND", "Payslip not found", 404);
    await syncPayslipLedger(item);
    return item;
  },

  async removePayslip(id: string) {
    await dbConnect();
    const item = await Payslip.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Payslip not found", 404);
    await accountingService.removeBySource("payslip", id);
    return { ok: true };
  },

  /**
   * Makes this month's payslips for every active staff member with a basic salary,
   * from their salary structure, with approved unpaid leave taken off pro rata.
   * Staff who already have a payslip for the month are left alone.
   */
  async generateMonth(month: string, branchCode?: string | null) {
    await dbConnect();
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    const daysInMonth = end.getDate();
    const filter: Record<string, unknown> = { status: "active", basicSalary: { $gt: 0 } };
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    // Teachers and campus staff alike — everyone with a basic salary on their record.
    const [teachers, campusStaff, existing, unpaidLeaves] = await Promise.all([
      Teacher.find(filter).lean(),
      Staff.find(filter).lean(),
      Payslip.find({ month }).select("teacherId").lean(),
      LeaveRequest.find({ status: "approved", leaveType: "unpaid", fromDate: { $lte: end }, toDate: { $gte: start } }).lean(),
    ]);
    const done = new Set(existing.map((p) => String(p.teacherId)));
    const DAY = 86400000;
    const unpaidByTeacher = new Map<string, number>();
    for (const l of unpaidLeaves) {
      // Only the days of the leave that fall inside this month.
      const from = Math.max(new Date(l.fromDate).getTime(), start.getTime());
      const to = Math.min(new Date(l.toDate).getTime(), end.getTime());
      const days = Math.min(Math.floor((to - from) / DAY) + 1, l.days || Infinity);
      if (days > 0) unpaidByTeacher.set(String(l.teacherId), (unpaidByTeacher.get(String(l.teacherId)) || 0) + days);
    }

    const created: string[] = [];
    const failed: { name: string; error: string }[] = [];
    const staff = [
      ...teachers.map((t: Record<string, unknown>) => ({ ...t, employeeModel: "Teacher" as const })),
      ...campusStaff.map((t: Record<string, unknown>) => ({ ...t, employeeModel: "Staff" as const })),
    ] as ((typeof teachers)[number] & { employeeModel: "Teacher" | "Staff" })[];
    for (const t of staff) {
      if (done.has(String(t._id))) continue;
      const heads: { head: string; kind: string; amount: number }[] = t.salaryHeads || [];
      const parsed = payslipSchema.safeParse({
        teacherId: String(t._id),
        employeeModel: t.employeeModel,
        month,
        basic: t.basicSalary,
        allowances: heads.length ? 0 : t.allowances || 0,
        earnings: heads.length ? heads.filter((h) => h.kind === "earning").map(({ head, amount }) => ({ head, amount })) : undefined,
        deductionItems: heads.length ? heads.filter((h) => h.kind === "deduction").map(({ head, amount }) => ({ head, amount })) : undefined,
        workingDays: daysInMonth,
        unpaidDays: unpaidByTeacher.get(String(t._id)) || 0,
        paymentMethod: t.paymentMethod || (t.bankAccount ? "bank" : "cash"),
        status: "pending",
        branchCode: t.branchCode,
      });
      const name = `${t.firstName} ${t.lastName}`;
      if (!parsed.success) {
        failed.push({ name, error: parsed.error.issues[0]?.message || "Invalid salary details" });
        continue;
      }
      try {
        await this.createPayslip(parsed.data);
        created.push(name);
      } catch (e) {
        failed.push({ name, error: (e as Error).message });
      }
    }
    return { month, created: created.length, skipped: done.size, failed, names: created };
  },

  /** Everything the printed salary slip needs: employee, itemised pay, year-to-date and letterhead. */
  async payslipForPrint(id: string) {
    await dbConnect();
    const slip = await Payslip.findById(id).lean();
    if (!slip) throw new ServiceError("NOT_FOUND", "Payslip not found", 404);
    const teacher = await employeeOf(
      slip,
      "firstName lastName employeeId designation department cnic taxNumber joinDate bankName bankAccount branchCode employmentType"
    );
    const posted = (await voucherNumbers([id])).get(id) || null;
    const cfg = await salaryTaxService.config();
    const year = taxYearOf(slip.month, cfg);
    const months = taxYearMonths(year, cfg).filter((m) => m <= slip.month);
    const [ytdSlips, head] = await Promise.all([
      Payslip.find({ teacherId: slip.teacherId, month: { $in: months } }).select("basic allowances incomeTax net").lean(),
      letterhead(slip.branchCode || teacher?.branchCode),
    ]);
    const sum = (f: (p: (typeof ytdSlips)[number]) => number) => Math.round(ytdSlips.reduce((t, p) => t + f(p), 0) * 100) / 100;
    return {
      payslip: slip,
      voucher: posted,
      teacher: teacher
        ? {
            name: `${teacher.firstName} ${teacher.lastName}`,
            employeeId: teacher.employeeId,
            designation: teacher.designation || "Teacher",
            department: teacher.department || "",
            cnic: teacher.cnic || "",
            taxNumber: teacher.taxNumber || "",
            joinDate: teacher.joinDate || null,
            bankName: teacher.bankName || "",
            bankAccount: teacher.bankAccount || "",
            employmentType: teacher.employmentType || "",
          }
        : null,
      ytd: {
        taxYear: taxYearLabel(year, cfg),
        gross: sum((p) => (p.basic || 0) + (p.allowances || 0)),
        tax: sum((p) => p.incomeTax || 0),
        net: sum((p) => p.net || 0),
      },
      school: head,
    };
  },

  async payrollSummary() {
    await dbConnect();
    const rows = await Payslip.aggregate([
      {
        $group: {
          _id: "$status",
          total: { $sum: "$net" },
          count: { $sum: 1 },
        },
      },
    ]);
    const paid = rows.find((r) => r._id === "paid")?.total ?? 0;
    const pending = rows.find((r) => r._id === "pending")?.total ?? 0;
    const draft = rows.find((r) => r._id === "draft")?.total ?? 0;
    return { paid, pending, draft, total: paid + pending + draft };
  },
};
