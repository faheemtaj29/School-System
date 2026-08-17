import { dbConnect } from "@/backend/config/database";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { Settings } from "@/backend/models/Settings";
import { Teacher } from "@/backend/models/Teacher";
import { ServiceError, type SessionUser } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type { leaveSchema, payslipSchema } from "@/backend/validators/modules.validator";
import { accountingService } from "@/backend/services/accounting.service";
import { platformService } from "@/backend/services/platform.service";

type LeaveInput = z.infer<typeof leaveSchema>;
type PayslipInput = z.infer<typeof payslipSchema>;

function normalizeBranch(code?: string | null) {
  const clean = code?.trim();
  return clean ? clean.toUpperCase() : undefined;
}

async function resolveBranchCode(input: {
  branchCode?: string | null;
  teacherId?: string;
}) {
  const settings = await Settings.findOne().select("branches defaultBranchCode").lean();
  const configuredBranches = (settings?.branches || [])
    .map((branch) => normalizeBranch(branch.code))
    .filter(Boolean);
  const allowedBranches = new Set(configuredBranches.length ? configuredBranches : ["MAIN"]);
  const teacherBranch = input.teacherId
    ? normalizeBranch(
        (
          await Teacher.findById(input.teacherId).select("branchCode").lean()
        )?.branchCode
      )
    : undefined;
  const resolved =
    normalizeBranch(input.branchCode) ||
    teacherBranch ||
    normalizeBranch(settings?.defaultBranchCode) ||
    "MAIN";
  if (!allowedBranches.has(resolved)) {
    throw new ServiceError("VALIDATION", `Unknown branch code '${resolved}'`, 400);
  }
  if (teacherBranch && resolved !== teacherBranch) {
    throw new ServiceError("VALIDATION", "Payslip branch must match teacher branch", 400);
  }
  return resolved;
}

async function syncPayslipLedger(slip: {
  _id: { toString(): string };
  month: string;
  net: number;
  status: string;
  paidOn?: Date | null;
  branchCode?: string;
  teacherId: unknown;
}) {
  if (slip.status !== "paid" || slip.net <= 0) {
    await accountingService.removeBySource("payslip", String(slip._id));
    return;
  }
  await accountingService.upsertLinked({
    type: "expense",
    category: "Payroll",
    title: `Salary ${slip.month}`,
    amount: slip.net,
    date: slip.paidOn || new Date(),
    method: "bank",
    reference: `PAY-${slip.month}`,
    notes: "Auto-posted from paid payslip",
    branchCode: slip.branchCode,
    sourceType: "payslip",
    sourceId: String(slip._id),
    skipTax: true,
  });
}

export const hrService = {
  async listLeaves() {
    await dbConnect();
    return LeaveRequest.find()
      .populate("teacherId", "firstName lastName employeeId branchCode")
      .sort({ createdAt: -1 })
      .lean();
  },

  async listLeavesForTeacher(teacherId: string) {
    await dbConnect();
    return LeaveRequest.find({ teacherId })
      .populate("teacherId", "firstName lastName employeeId branchCode")
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
      .populate("teacherId", "firstName lastName employeeId email branchCode")
      .sort({ month: -1 })
      .lean();
  },

  async listPayslipsForTeacher(teacherId: string) {
    await dbConnect();
    return Payslip.find({ teacherId })
      .populate("teacherId", "firstName lastName employeeId email branchCode")
      .sort({ month: -1 })
      .lean();
  },

  async createPayslip(data: PayslipInput) {
    await dbConnect();
    const net = data.basic + data.allowances - data.deductions;
    const branchCode = await resolveBranchCode({ branchCode: data.branchCode, teacherId: data.teacherId });
    const slip = await Payslip.create({
      ...data,
      branchCode,
      net,
      paidOn: parseOptionalDate(data.paidOn ?? undefined),
    });
    await syncPayslipLedger(slip);
    return slip;
  },

  async updatePayslip(id: string, data: PayslipInput) {
    await dbConnect();
    const net = data.basic + data.allowances - data.deductions;
    const branchCode = await resolveBranchCode({ branchCode: data.branchCode, teacherId: data.teacherId });
    const item = await Payslip.findByIdAndUpdate(
      id,
      {
        ...data,
        branchCode,
        net,
        paidOn: parseOptionalDate(data.paidOn ?? undefined),
      },
      { new: true }
    ).populate("teacherId", "firstName lastName employeeId email");
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
