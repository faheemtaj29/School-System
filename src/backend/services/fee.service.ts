/**
 * Fee vouchers linked to students — paid amounts auto-post to Accounting.
 * Each voucher carries one or more fee-head lines; concessions apply on create.
 */
import { dbConnect } from "@/backend/config/database";
import mongoose from "mongoose";
import { Fee, FeePayment } from "@/backend/models/Fee";
import { Student } from "@/backend/models/Student";
import { Voucher } from "@/backend/models/Accounting";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError } from "@/backend/types";
import type {
  BulkFeeInput,
  FeeInput,
  FeePaymentInput,
  InstallmentFeeInput,
} from "@/backend/validators/fee.validator";
import { accountingService } from "@/backend/services/accounting.service";
import { DISCOUNT_DEFAULTS } from "@/backend/services/student.service";
import { Settings } from "@/backend/models/Settings";
import { platformService } from "@/backend/services/platform.service";
import type { SessionUser } from "@/backend/types";
import { recordAudit } from "@/backend/lib/audit";

const studentPopulate = {
  path: "studentId",
  select:
    "firstName lastName admissionNo classId branchCode discountType discountPercent",
  populate: { path: "classId", select: "name section branchCode" },
} as const;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function cleanLines(lines: { head: string; amount: number; accountCode?: string }[]) {
  const cleaned = lines
    .map((line) => ({
      head: line.head.trim(),
      amount: roundMoney(Number(line.amount) || 0),
      accountCode: line.accountCode?.trim() || undefined,
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
    lines: { head: string; amount: number; accountCode?: string }[];
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
  const receipts = await FeePayment.find({ feeId: fee._id, status: "posted" })
    .select("amount")
    .lean();
  const tracked = receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const paid = roundMoney(Math.max(0, (fee.paidAmount || 0) - tracked));
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

    const fees = await Fee.find(query).populate(studentPopulate).sort({ dueDate: -1 }).lean();
    if (!fees.length) return fees;
    const payments = await FeePayment.find({
      feeId: { $in: fees.map((fee) => fee._id) },
    })
      .populate("receivedBy", "name")
      .populate("reversedBy", "name")
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean();
    const byFee = new Map<string, typeof payments>();
    for (const payment of payments) {
      const key = String(payment.feeId);
      const rows = byFee.get(key) || [];
      rows.push(payment);
      byFee.set(key, rows);
    }
    return fees.map((fee) => ({
      ...fee,
      payments: byFee.get(String(fee._id)) || [],
    }));
  },

  async studentLedger(studentId: string) {
    await dbConnect();
    const feeIds = await Fee.find({ studentId }).distinct("_id");
    return Voucher.find({
      $or: [
        { partyType: "student", partyId: studentId },
        { sourceType: "fee", sourceId: { $in: feeIds.map(String) } },
      ],
    })
      .sort({ date: -1, createdAt: -1 })
      .limit(500)
      .lean();
  },

  async create(data: FeeInput) {
    await dbConnect();
    if ((data.paidAmount || 0) > 0 || data.status !== "pending") {
      throw new ServiceError(
        "VALIDATION",
        "Payments must be recorded through the fee collection workflow",
        400
      );
    }
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
    if (
      roundMoney(data.paidAmount || 0) !== roundMoney(existing.paidAmount || 0) ||
      data.status !== existing.status
    ) {
      throw new ServiceError(
        "CONFLICT",
        "Paid amounts and fee status are managed by recorded receipts; use Receive Payment or an authorized reversal",
        409
      );
    }

    /** Keep original concession ratio when editing heads, if one was applied. */
    let amount = gross;
    let originalAmount = gross;
    let discountAmount = 0;
    const discountPercent = existing.discountPercent || 0;
    const discountType = existing.discountType;
    if ((existing.discountPercent || 0) > 0) {
      discountAmount = roundMoney((gross * (existing.discountPercent || 0)) / 100);
      amount = roundMoney(Math.max(0, gross - discountAmount));
      originalAmount = gross;
    }
    if (amount < (existing.paidAmount || 0)) {
      throw new ServiceError(
        "VALIDATION",
        "The challan amount cannot be lower than its recorded payments",
        400
      );
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
          status:
            (existing.paidAmount || 0) >= amount
              ? "paid"
              : (existing.paidAmount || 0) > 0
                ? "partial"
                : new Date(data.dueDate) < new Date()
                  ? "overdue"
                  : "pending",
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
    if (
      (await FeePayment.exists({ feeId: id })) ||
      (await Fee.exists({ _id: id, paidAmount: { $gt: 0 } }))
    ) {
      throw new ServiceError(
        "CONFLICT",
        "A challan with payment history cannot be deleted; reverse the receipt with an audit reason instead",
        409
      );
    }
    const item = await Fee.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Fee not found", 404);
    await accountingService.removeBySource("fee", id);
    return { ok: true };
  },

  async collectPayment(
    feeId: string,
    input: FeePaymentInput,
    actor: SessionUser
  ) {
    await dbConnect();
    await accountingService.accounts();
    const amount = roundMoney(input.amount);
    const paymentDate = new Date(input.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      throw new ServiceError("VALIDATION", "Enter a valid payment date", 400);
    }
    const previous = await FeePayment.findOne({ idempotencyKey: input.idempotencyKey })
      .populate("receivedBy", "name")
      .lean();
    if (previous) {
      if (
        String(previous.feeId) !== feeId ||
        roundMoney(previous.amount) !== amount ||
        previous.depositAccountCode !== input.depositAccountCode ||
        previous.method !== input.method ||
        previous.paymentDate.getTime() !== paymentDate.getTime() ||
        (previous.transactionReference || "") !== (input.transactionReference || "")
      ) {
        throw new ServiceError(
          "CONFLICT",
          "This payment submission key was already used for a different payment",
          409
        );
      }
      return { payment: previous, fee: await Fee.findById(feeId).populate(studentPopulate).lean() };
    }

    const session = await mongoose.startSession();
    let paymentId = "";
    let postedVoucher: { _id: { toString(): string }; number: string } | undefined;
    try {
      await session.withTransaction(async () => {
        const duplicate = await FeePayment.findOne({
          idempotencyKey: input.idempotencyKey,
        }).session(session);
        if (duplicate) {
          if (
            String(duplicate.feeId) !== feeId ||
            roundMoney(duplicate.amount) !== amount ||
            duplicate.depositAccountCode !== input.depositAccountCode ||
            duplicate.method !== input.method ||
            duplicate.paymentDate.getTime() !== paymentDate.getTime() ||
            (duplicate.transactionReference || "") !== (input.transactionReference || "")
          ) {
            throw new ServiceError(
              "CONFLICT",
              "This payment submission key was already used for a different payment",
              409
            );
          }
          paymentId = String(duplicate._id);
          return;
        }

        const fee = await Fee.findById(feeId).session(session);
        if (!fee) throw new ServiceError("NOT_FOUND", "Fee challan not found", 404);
        const outstanding = roundMoney(fee.amount - (fee.paidAmount || 0));
        if (outstanding <= 0) {
          throw new ServiceError("CONFLICT", "This challan has no outstanding balance", 409);
        }
        if (amount <= 0 || amount > outstanding) {
          throw new ServiceError(
            "VALIDATION",
            `Payment must be greater than zero and no more than the outstanding balance of PKR ${outstanding.toFixed(2)}`,
            400
          );
        }
        const student = await Student.findById(fee.studentId)
          .select("firstName lastName admissionNo")
          .session(session)
          .lean();
        if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);

        const nextPaymentId = new mongoose.Types.ObjectId();
        const voucher = await accountingService.postFeeReceipt(
          {
            paymentId: String(nextPaymentId),
            studentId: String(student._id),
            studentName: `${student.firstName} ${student.lastName}`.trim(),
            admissionNo: student.admissionNo,
            title: fee.title,
            amount,
            paymentDate,
            method: input.method,
            depositAccountCode: input.depositAccountCode,
            transactionReference: input.transactionReference,
            branchCode: fee.branchCode,
            feeLines: fee.lines.map((line: { head: string; amount: number; accountCode?: string }) => ({
              head: line.head,
              amount: line.amount,
              accountCode: line.accountCode,
            })),
            recordedBy: actor.id,
          },
          session
        );

        fee.paidAmount = roundMoney((fee.paidAmount || 0) + amount);
          fee.status =
          fee.paidAmount >= fee.amount
            ? "paid"
              : fee.paidAmount > 0
                ? "partial"
                : fee.dueDate < new Date()
                  ? "overdue"
                  : "pending";
        fee.paymentDate = paymentDate;
        fee.method = input.method;
        await fee.save({ session });

        const payment = new FeePayment({
          _id: nextPaymentId,
          feeId: fee._id,
          studentId: student._id,
          receiptNumber: voucher.number,
          idempotencyKey: input.idempotencyKey,
          amount,
          method: input.method,
          depositAccountCode: input.depositAccountCode,
          paymentDate,
          transactionReference: input.transactionReference,
          voucherId: voucher._id,
          voucherNumber: voucher.number,
          status: "posted",
          receivedBy: actor.id,
        });
        await payment.save({ session });
        paymentId = String(payment._id);
        postedVoucher = voucher;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Transaction numbers are only allowed") ||
        message.includes("replica set")
      ) {
        throw new ServiceError(
          "INTERNAL",
          "Fee collection requires MongoDB transaction support; configure MongoDB as a replica set before receiving payments",
          500
        );
      }
      if ((error as { code?: number })?.code === 11000) {
        const duplicate = await FeePayment.findOne({
          idempotencyKey: input.idempotencyKey,
        })
          .populate("receivedBy", "name")
          .lean();
        if (
          duplicate &&
          String(duplicate.feeId) === feeId &&
          roundMoney(duplicate.amount) === amount &&
          duplicate.depositAccountCode === input.depositAccountCode &&
          duplicate.method === input.method &&
          duplicate.paymentDate.getTime() === paymentDate.getTime() &&
          (duplicate.transactionReference || "") === (input.transactionReference || "")
        ) {
          return {
            payment: duplicate,
            fee: await Fee.findById(feeId).populate(studentPopulate).lean(),
          };
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }

    if (postedVoucher) {
      await recordAudit({
        module: "accounting",
        action: "posted",
        entity: "voucher",
        entityId: postedVoucher._id.toString(),
        summary: `Posted fee receipt ${postedVoucher.number}`,
        after: { number: postedVoucher.number, status: "posted" },
        actor,
      });
    }
    const payment = await FeePayment.findById(paymentId)
      .populate("receivedBy", "name")
      .lean();
    const fee = await Fee.findById(feeId).populate(studentPopulate).lean();
    if (!payment || !fee) {
      throw new ServiceError("INTERNAL", "Payment was committed but could not be reloaded", 500);
    }
    return { payment, fee };
  },

  async reversePayment(
    feeId: string,
    paymentId: string,
    reason: string,
    actor: SessionUser
  ) {
    await dbConnect();
    const session = await mongoose.startSession();
    type ReversalResult = {
      payment: { _id: { toString(): string } };
      feeId: string;
      voucher: { _id: { toString(): string }; number: string };
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    };
    let reversed: ReversalResult | null = null;
    try {
      await session.withTransaction(async () => {
        const payment = await FeePayment.findById(paymentId).session(session);
        if (!payment) throw new ServiceError("NOT_FOUND", "Payment receipt not found", 404);
        if (String(payment.feeId) !== feeId) {
          throw new ServiceError("NOT_FOUND", "Payment receipt not found for this challan", 404);
        }
        if (payment.status !== "posted") {
          throw new ServiceError("CONFLICT", "This payment has already been reversed", 409);
        }
        const fee = await Fee.findById(payment.feeId).session(session);
        if (!fee || fee.paidAmount < payment.amount) {
          throw new ServiceError(
            "CONFLICT",
            "The challan balance no longer matches this receipt; reconcile it before reversal",
            409
          );
        }
        const voucherResult = await accountingService.reverseFeeReceipt(
          String(payment.voucherId),
          reason,
          actor,
          session
        );
        payment.status = "reversed";
        payment.reversedAt = new Date();
        payment.reversedBy = actor.id as never;
        payment.reversalReason = reason;
        await payment.save({ session });

        fee.paidAmount = roundMoney(fee.paidAmount - payment.amount);
        fee.status =
          fee.paidAmount <= 0
            ? fee.dueDate < new Date()
              ? "overdue"
              : "pending"
            : "partial";
        const latestPayment = await FeePayment.findOne({
          feeId: fee._id,
          status: "posted",
          _id: { $ne: payment._id },
        })
          .sort({ paymentDate: -1, createdAt: -1 })
          .session(session);
        fee.paymentDate = latestPayment?.paymentDate;
        fee.method = latestPayment?.method;
        await fee.save({ session });

        reversed = {
          payment,
          feeId: String(fee._id),
          voucher: voucherResult.voucher,
          before: voucherResult.before,
          after: voucherResult.after,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("Transaction numbers are only allowed") ||
        message.includes("replica set")
      ) {
        throw new ServiceError(
          "INTERNAL",
          "Fee receipt reversal requires MongoDB transaction support; configure MongoDB as a replica set",
          500
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
    const completed = reversed as ReversalResult | null;
    if (!completed) throw new ServiceError("INTERNAL", "Payment reversal did not complete", 500);
    await recordAudit({
      module: "accounting",
      action: "reversed",
      entity: "voucher",
      entityId: completed.voucher._id.toString(),
      summary: `Reversed fee receipt ${completed.voucher.number} — ${reason}`,
      before: completed.before,
      after: completed.after,
      actor,
    });
    return {
      payment: await FeePayment.findById(completed.payment._id)
        .populate("receivedBy", "name")
        .populate("reversedBy", "name")
        .lean(),
      fee: await Fee.findById(completed.feeId)
        .populate(studentPopulate)
        .lean(),
    };
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
        accountCode: line.accountCode,
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
      fee.status = fee.paidAmount > 0 ? "partial" : "overdue";
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
