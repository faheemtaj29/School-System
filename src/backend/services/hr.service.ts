import { dbConnect } from "@/backend/config/database";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { ServiceError, type SessionUser } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type { leaveSchema, payslipSchema } from "@/backend/validators/modules.validator";
import { accountingService } from "@/backend/services/accounting.service";
import { platformService } from "@/backend/services/platform.service";
import { salaryTaxService } from "@/backend/services/salaryTax.service";
import { Teacher } from "@/backend/models/Teacher";

type LeaveInput = z.infer<typeof leaveSchema>;
type PayslipInput = z.infer<typeof payslipSchema>;

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
  teacherId: unknown;
}) {
  const id = String(slip._id);
  await accountingService.removeBySource("payslip", id);
  if (slip.status !== "paid" || slip.net <= 0) return;
  const gross = Math.round((slip.basic + slip.allowances) * 100) / 100;
  const [expense, bank, taxPayable, deductions] = await Promise.all([
    accountingService.ensureAccount({ systemKey: "payrollExpense", code: "51010101", name: "Salaries & Wages", type: "expense", level: 5, parentCode: "510101", isPosting: true }),
    accountingService.ensureAccount({ systemKey: "bank", code: "11010102", name: "Main Bank Account", type: "asset", level: 5, parentCode: "110101", isPosting: true }),
    accountingService.ensureAccount({ systemKey: "salaryTaxPayable", code: "21020102", name: "Income Tax Withheld on Salaries", type: "liability", level: 5, parentCode: "210201", isPosting: true }),
    accountingService.ensureAccount({ systemKey: "payrollDeductions", code: "21010102", name: "Payroll Deductions Payable", type: "liability", level: 5, parentCode: "210101", isPosting: true }),
  ]);
  const teacher = await Teacher.findById(slip.teacherId).select("firstName lastName").lean();
  const who = teacher ? `${teacher.firstName} ${teacher.lastName}` : "Staff";
  await accountingService.postLinkedJournal({
    sourceType: "payslip",
    sourceId: id,
    date: slip.paidOn || new Date(),
    branchCode: slip.branchCode || "MAIN",
    narration: `Salary ${slip.month} — ${who}`,
    reference: `PAY-${slip.month}`,
    partyName: who,
    lines: [
      { accountCode: expense.code as string, debit: gross, credit: 0, narration: `Gross salary ${slip.month}` },
      { accountCode: bank.code as string, debit: 0, credit: slip.net, narration: "Net pay" },
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
    return Payslip.find()
      .populate("teacherId", "firstName lastName employeeId email branchCode photoUpdatedAt")
      .sort({ month: -1 })
      .lean();
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
          "A payslip already exists for this teacher and month.",
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
          "A payslip already exists for this teacher and month.",
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
