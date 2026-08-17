/**
 * Fee vouchers linked to students — paid amounts auto-post to Accounting.
 * Each voucher carries one or more fee-head lines; concessions apply on create.
 */
import { dbConnect } from "@/backend/config/database";
import { Fee } from "@/backend/models/Fee";
import { Student } from "@/backend/models/Student";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type { BulkFeeInput, FeeInput, InstallmentFeeInput } from "@/backend/validators/fee.validator";
import { accountingService } from "@/backend/services/accounting.service";
import { DISCOUNT_DEFAULTS } from "@/backend/services/student.service";
import { Settings } from "@/backend/models/Settings";
import { platformService } from "@/backend/services/platform.service";
import type { SessionUser } from "@/backend/types";

const studentPopulate = {
  path: "studentId",
  select:
    "firstName lastName admissionNo classId branchCode discountType discountPercent",
  populate: { path: "classId", select: "name section branchCode" },
} as const;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function cleanLines(lines: { head: string; amount: number }[]) {
  const cleaned = lines
    .map((line) => ({
      head: line.head.trim(),
      amount: roundMoney(Number(line.amount) || 0),
    }))
    .filter((line) => line.head);
  if (!cleaned.length) {
    throw new ServiceError("VALIDATION", "Add at least one fee head", 400);
  }
  if (cleaned.every((line) => line.amount <= 0)) {
    throw new ServiceError("VALIDATION", "Enter an amount on at least one fee head", 400);
  }
  return cleaned;
}

function titleFromLines(lines: { head: string; amount: number }[], fallback?: string) {
  const named = lines.filter((l) => l.amount > 0).map((l) => l.head);
  if (fallback?.trim()) return fallback.trim();
  if (named.length <= 2) return named.join(" + ");
  return `${named[0]} + ${named.length - 1} more`;
}

function concessionFor(student: {
  discountType?: string | null;
  discountPercent?: number | null;
}) {
  const type = student.discountType || "none";
  if (type === "none") return { type, percent: 0 };
  const percent =
    student.discountPercent != null && student.discountPercent > 0
      ? student.discountPercent
      : DISCOUNT_DEFAULTS[type] ?? 0;
  return { type, percent };
}

function applyConcession(
  gross: number,
  student: { discountType?: string | null; discountPercent?: number | null }
) {
  const { type, percent } = concessionFor(student);
  const discountAmount = roundMoney((gross * percent) / 100);
  const amount = roundMoney(Math.max(0, gross - discountAmount));
  return {
    originalAmount: gross,
    amount,
    discountPercent: percent,
    discountAmount,
    discountType: type,
  };
}

function toPayload(
  data: FeeInput & {
    title: string;
    lines: { head: string; amount: number }[];
    amount: number;
    originalAmount?: number;
    discountPercent?: number;
    discountAmount?: number;
    discountType?: string;
  }
) {
  return {
    studentId: data.studentId,
    title: data.title,
    lines: data.lines,
    amount: data.amount,
    originalAmount: data.originalAmount,
    discountPercent: data.discountPercent,
    discountAmount: data.discountAmount,
    discountType: data.discountType,
    status: data.status,
    paidAmount: data.paidAmount,
    method: data.method,
    notes: data.notes,
    branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
    dueDate: new Date(data.dueDate),
    paymentDate: parseOptionalDate(data.paymentDate ?? undefined),
  };
}

async function syncFeeLedger(fee: {
  _id: { toString(): string };
  title: string;
  paidAmount: number;
  status: string;
  paymentDate?: Date | null;
  method?: string;
  branchCode?: string;
  studentId: unknown;
}) {
  const paid = fee.paidAmount || 0;
  if (paid <= 0 || fee.status === "pending") {
    await accountingService.removeBySource("fee", String(fee._id));
    return;
  }
  await accountingService.upsertLinked({
    type: "income",
    category: "Student Fees",
    title: fee.title,
    amount: paid,
    date: fee.paymentDate || new Date(),
    method: fee.method as "cash" | "bank" | "online" | undefined,
    reference: `FEE-${String(fee._id).slice(-6).toUpperCase()}`,
    notes: "Auto-posted from fee voucher",
    branchCode: fee.branchCode,
    sourceType: "fee",
    sourceId: String(fee._id),
  });
}

export const feeService = {
  async list(filters: {
    studentId?: string | null;
    status?: string | null;
    branchCode?: string | null;
  }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.status) query.status = filters.status;
    if (filters.branchCode) query.branchCode = filters.branchCode.toUpperCase();

    return Fee.find(query).populate(studentPopulate).sort({ dueDate: -1 }).lean();
  },

  async create(data: FeeInput) {
    await dbConnect();
    const student = await Student.findById(data.studentId)
      .select("discountType discountPercent branchCode")
      .lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);

    const lines = cleanLines(data.lines);
    const gross = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    const priced = applyConcession(gross, student);
    const title = titleFromLines(lines, data.title);
    const note =
      priced.discountAmount > 0
        ? `${data.notes ? `${data.notes} · ` : ""}${priced.discountType} ${priced.discountPercent}% off`
        : data.notes;

    const item = await Fee.create(
      toPayload({
        ...data,
        title,
        lines,
        ...priced,
        notes: note,
        branchCode: data.branchCode || student.branchCode,
      })
    );
    await syncFeeLedger(item);
    return Fee.findById(item._id).populate(studentPopulate).lean();
  },

  async update(id: string, data: FeeInput) {
    await dbConnect();
    const lines = cleanLines(data.lines);
    const gross = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    const existing = await Fee.findById(id).lean();
    if (!existing) throw new ServiceError("NOT_FOUND", "Fee not found", 404);

    /** Keep original concession ratio when editing heads, if one was applied. */
    let amount = gross;
    let originalAmount = gross;
    let discountAmount = 0;
    let discountPercent = existing.discountPercent || 0;
    let discountType = existing.discountType;
    if ((existing.discountPercent || 0) > 0) {
      discountAmount = roundMoney((gross * (existing.discountPercent || 0)) / 100);
      amount = roundMoney(Math.max(0, gross - discountAmount));
      originalAmount = gross;
    }

    const item = await Fee.findByIdAndUpdate(
      id,
      {
        ...toPayload({
          ...data,
          title: titleFromLines(lines, data.title),
          lines,
          amount,
          originalAmount,
          discountAmount,
          discountPercent,
          discountType,
        }),
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : null,
      },
      { new: true }
    ).populate(studentPopulate);
    if (!item) throw new ServiceError("NOT_FOUND", "Fee not found", 404);
    await syncFeeLedger(item);
    return item;
  },

  async remove(id: string) {
    await dbConnect();
    const item = await Fee.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Fee not found", 404);
    await accountingService.removeBySource("fee", id);
    return { ok: true };
  },

  /**
   * Raises a multi-head challan for every active student of a class.
   * Re-running the same summary title in the same month is skipped.
   */
  async generateBulk(data: BulkFeeInput) {
    await dbConnect();
    const lines = cleanLines(data.lines);
    const gross = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    const title = titleFromLines(lines, data.title);

    const studentQuery: Record<string, unknown> = { status: "active" };
    if (data.classId) studentQuery.classId = data.classId;
    if (data.branchCode) studentQuery.branchCode = data.branchCode.toUpperCase();

    const students = await Student.find(studentQuery)
      .select("_id branchCode discountType discountPercent")
      .lean();
    if (!students.length) {
      throw new ServiceError("VALIDATION", "No active students match this selection", 400);
    }

    const dueDate = new Date(data.dueDate);
    const monthStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
    const monthEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0, 23, 59, 59, 999);
    const already = await Fee.find({
      studentId: { $in: students.map((s) => s._id) },
      title,
      dueDate: { $gte: monthStart, $lte: monthEnd },
    })
      .select("studentId")
      .lean();
    const billed = new Set(already.map((fee) => String(fee.studentId)));

    const pending = students.filter((student) => !billed.has(String(student._id)));
    let billedAmount = 0;
    let discountTotal = 0;
    if (pending.length) {
      const docs = pending.map((student) => {
        const priced = applyConcession(gross, student);
        billedAmount += priced.amount;
        discountTotal += priced.discountAmount;
        return {
          studentId: student._id,
          title,
          lines,
          ...priced,
          dueDate,
          status: "pending" as const,
          paidAmount: 0,
          notes:
            priced.discountAmount > 0
              ? `${priced.discountType} ${priced.discountPercent}% concession`
              : undefined,
          branchCode:
            (data.branchCode || student.branchCode || "").toUpperCase() || undefined,
        };
      });
      await Fee.insertMany(docs);
    }

    return {
      created: pending.length,
      skipped: students.length - pending.length,
      students: students.length,
      billedAmount: roundMoney(billedAmount),
      discountTotal: roundMoney(discountTotal),
    };
  },

  /** Split one bill into N monthly installment vouchers. */
  async createInstallments(data: InstallmentFeeInput) {
    await dbConnect();
    const student = await Student.findById(data.studentId)
      .select("discountType discountPercent branchCode firstName lastName admissionNo")
      .lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);

    const lines = cleanLines(data.lines);
    const gross = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
    const priced = applyConcession(gross, student);
    const n = data.installments;
    const base = roundMoney(priced.amount / n);
    const parts: number[] = Array.from({ length: n }, () => base);
    parts[n - 1] = roundMoney(priced.amount - base * (n - 1));

    const group = `INST-${Date.now().toString(36).toUpperCase()}`;
    const baseTitle = titleFromLines(lines, data.title);
    const firstDue = new Date(data.firstDueDate);
    const created = [];

    for (let i = 0; i < n; i++) {
      const due = new Date(firstDue);
      due.setMonth(due.getMonth() + i);
      const share = parts[i] / (priced.amount || 1);
      const partLines = lines.map((line) => ({
        head: line.head,
        amount: roundMoney(line.amount * share),
      }));
      const doc = await Fee.create({
        studentId: data.studentId,
        title: `${baseTitle} · ${i + 1}/${n}`,
        lines: partLines,
        originalAmount: roundMoney(gross * share),
        amount: parts[i],
        discountPercent: priced.discountPercent,
        discountAmount: roundMoney((priced.discountAmount || 0) * share),
        discountType: priced.discountType,
        dueDate: due,
        status: "pending",
        paidAmount: 0,
        branchCode: data.branchCode || student.branchCode,
        installmentGroup: group,
        installmentNo: i + 1,
        installmentTotal: n,
        notes: `Installment ${i + 1} of ${n}`,
      });
      created.push(doc);
    }

    return {
      group,
      created: created.length,
      total: priced.amount,
      fees: await Fee.find({ installmentGroup: group }).populate(studentPopulate).lean(),
    };
  },

  /** Mark overdue vouchers and add late fee once per voucher. */
  async applyLateFees() {
    await dbConnect();
    const settings = await Settings.findOne().lean();
    const grace = settings?.lateFeeGraceDays ?? 7;
    const percent = settings?.lateFeePercent ?? 5;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - grace);

    const overdue = await Fee.find({
      status: { $in: ["pending", "partial"] },
      dueDate: { $lt: cutoff },
      lateFeeApplied: { $ne: true },
    });

    let updated = 0;
    for (const fee of overdue) {
      const balance = Math.max(0, fee.amount - (fee.paidAmount || 0));
      const late = roundMoney((balance * percent) / 100);
      fee.lateFeeAmount = late;
      fee.lateFeeApplied = true;
      fee.amount = roundMoney(fee.amount + late);
      fee.status = "overdue";
      fee.lines = [
        ...(fee.lines || []),
        ...(late > 0 ? [{ head: "Late Fee", amount: late }] : []),
      ];
      fee.notes = `${fee.notes ? `${fee.notes} · ` : ""}Late fee ${percent}% applied`;
      await fee.save();
      updated += 1;
    }
    return { updated, percent, graceDays: grace };
  },

  /** Start FEE_WAIVER approval for a student concession change. */
  async requestWaiver(
    input: {
      studentId: string;
      percent: number;
      discountType?: string;
      note?: string;
    },
    session: SessionUser
  ) {
    await dbConnect();
    const student = await Student.findById(input.studentId)
      .select("firstName lastName admissionNo")
      .lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    await platformService.seedDefaults();
    return platformService.startWorkflow(
      {
        workflowCode: "FEE_WAIVER",
        subjectType: "student",
        subjectId: input.studentId,
        title: `Fee waiver · ${student.admissionNo} · ${input.percent}%`,
        payload: {
          percent: input.percent,
          discountType: input.discountType || "need_based",
        },
        note: input.note,
      },
      session
    );
  },
};
