/**
 * Monthly fee billing — class fee structures, automatic monthly challans,
 * counter collection with receipts, and data for printing challans / receipts.
 */
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Fee, type IFeePayment } from "@/backend/models/Fee";
import { Settings } from "@/backend/models/Settings";
import { Student } from "@/backend/models/Student";
import { allocateCode } from "@/backend/services/numbering.service";
import { feeService, syncFeeLedger } from "@/backend/services/fee.service";
import { ServiceError, type SessionUser } from "@/backend/types";
import type { CollectFeeInput, FeeStructureInput } from "@/backend/validators/fee.validator";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function currentMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function classLabel(c?: { name?: string; section?: string } | null) {
  if (!c?.name) return "—";
  return c.section ? `${c.name} - ${c.section}` : c.name;
}

async function schoolHeader() {
  const s = await Settings.findOne()
    .select("schoolName address phone email logoUpdatedAt currency lateFeePercent lateFeeGraceDays registrationNo")
    .lean();
  return {
    name: s?.schoolName || "School",
    address: s?.address || "",
    phone: s?.phone || "",
    email: s?.email || "",
    registrationNo: s?.registrationNo || "",
    currency: s?.currency || "PKR",
    lateFeePercent: s?.lateFeePercent ?? 0,
    lateFeeGraceDays: s?.lateFeeGraceDays ?? 0,
    logoUrl: s?.logoUpdatedAt ? `/api/settings/logo?v=${new Date(s.logoUpdatedAt).getTime()}` : null,
  };
}

type FeeLean = {
  _id: Types.ObjectId;
  studentId: {
    _id: Types.ObjectId;
    firstName: string;
    lastName: string;
    admissionNo: string;
    rollNumber?: string;
    parentName?: string;
    parentPhone?: string;
    classId?: { name: string; section: string } | null;
  } | null;
  title: string;
  lines: { head: string; amount: number }[];
  originalAmount?: number;
  amount: number;
  discountAmount?: number;
  discountType?: string;
  discountPercent?: number;
  dueDate: Date;
  status: string;
  paidAmount: number;
  paymentDate?: Date;
  method?: IFeePayment["method"];
  receiptNo?: string;
  payments?: IFeePayment[];
  billingMonth?: string;
  lateFeeAmount?: number;
};

const studentFields = {
  path: "studentId",
  select: "firstName lastName admissionNo rollNumber parentName parentPhone classId",
  populate: { path: "classId", select: "name section" },
} as const;

export const feeBillingService = {
  async structure() {
    await dbConnect();
    const [classes, counts, settings] = await Promise.all([
      ClassModel.find().select("name section level feeStructure").lean(),
      Student.aggregate<{ _id: Types.ObjectId; n: number }>([
        { $match: { status: "active" } },
        { $group: { _id: "$classId", n: { $sum: 1 } } },
      ]),
      Settings.findOne().select("autoMonthlyFees feeGenerateDay feeDueDay lastAutoFeeMonth currency optionLists").lean(),
    ]);
    const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
    return {
      settings: {
        autoMonthlyFees: settings?.autoMonthlyFees ?? false,
        feeGenerateDay: settings?.feeGenerateDay ?? 1,
        feeDueDay: settings?.feeDueDay ?? 10,
        lastAutoFeeMonth: settings?.lastAutoFeeMonth || null,
        currency: settings?.currency || "PKR",
        feeHeads: settings?.optionLists?.feeHeads || [],
      },
      classes: classes
        .sort(
          (a, b) =>
            (a.level ?? 0) - (b.level ?? 0) ||
            a.name.localeCompare(b.name, undefined, { numeric: true }) ||
            a.section.localeCompare(b.section)
        )
        .map((c) => ({
          _id: String(c._id),
          classLabel: classLabel(c),
          students: countBy.get(String(c._id)) || 0,
          lines: c.feeStructure || [],
          monthly: round((c.feeStructure || []).reduce((s: number, l: { amount: number }) => s + l.amount, 0)),
        })),
    };
  },

  async saveStructure(data: FeeStructureInput) {
    await dbConnect();
    for (const c of data.classes) {
      const lines = c.lines
        .map((l) => ({ head: l.head.trim(), amount: round(Number(l.amount) || 0) }))
        .filter((l) => l.head && l.amount > 0);
      await ClassModel.updateOne({ _id: c.classId }, { $set: { feeStructure: lines } });
    }
    const patch: Record<string, unknown> = {};
    if (data.autoMonthlyFees !== undefined) patch.autoMonthlyFees = data.autoMonthlyFees;
    if (data.feeGenerateDay !== undefined) patch.feeGenerateDay = data.feeGenerateDay;
    if (data.feeDueDay !== undefined) patch.feeDueDay = data.feeDueDay;
    if (Object.keys(patch).length) await Settings.updateOne({}, { $set: patch }, { upsert: true });
    return this.structure();
  },

  /** Raise this month's challan for every active student of each class that has a fee structure. */
  async generateMonth(month: string, classIds?: string[]) {
    await dbConnect();
    const settings = await Settings.findOne().select("feeDueDay").lean();
    const [y, m] = month.split("-").map(Number);
    const dueDay = Math.min(28, settings?.feeDueDay || 10);
    const dueDate = `${y}-${String(m).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
    const query: Record<string, unknown> = { "feeStructure.0": { $exists: true } };
    if (classIds?.length) query._id = { $in: classIds };
    const classes = await ClassModel.find(query).select("name section feeStructure").lean();

    const results = [];
    let created = 0;
    let skipped = 0;
    let billed = 0;
    for (const cls of classes) {
      try {
        const r = await feeService.generateBulk({
          classId: String(cls._id),
          lines: cls.feeStructure,
          title: `Monthly Fee · ${monthLabel(month)}`,
          dueDate,
          billingMonth: month,
        });
        created += r.created;
        skipped += r.skipped;
        billed += r.billedAmount;
        results.push({ classLabel: classLabel(cls), created: r.created, skipped: r.skipped });
      } catch (e) {
        // A class without active students is not an error for a whole-school run.
        results.push({ classLabel: classLabel(cls), created: 0, skipped: 0, note: (e as Error).message });
      }
    }
    return { month, monthLabel: monthLabel(month), dueDate, classes: results, created, skipped, billedAmount: round(billed) };
  },

  /**
   * Run the monthly billing once per month on/after the configured day.
   * The month is claimed atomically, so parallel triggers never double-bill.
   */
  async runAutoIfDue(now = new Date()) {
    await dbConnect();
    const settings = await Settings.findOne().select("autoMonthlyFees feeGenerateDay lastAutoFeeMonth").lean();
    if (!settings?.autoMonthlyFees) return null;
    if (now.getDate() < (settings.feeGenerateDay || 1)) return null;
    const month = currentMonth(now);
    if (settings.lastAutoFeeMonth === month) return null;
    const claimed = await Settings.findOneAndUpdate(
      { _id: settings._id, lastAutoFeeMonth: { $ne: month } },
      { $set: { lastAutoFeeMonth: month } }
    );
    if (!claimed) return null;
    try {
      const result = await this.generateMonth(month);
      if (result.classes.some((item) => "note" in item)) {
        // Some classes failed even though the whole-school run returned a partial result.
        // Release the claim so the next request can retry; already-created challans are skipped.
        await Settings.updateOne(
          { _id: settings._id, lastAutoFeeMonth: month },
          { $unset: { lastAutoFeeMonth: 1 } }
        );
      }
      console.log(`[fees] automatic billing for ${month}: ${result.created} challan(s) raised`);
      return result;
    } catch (error) {
      // Release the monthly claim if billing fails, so a later request can retry.
      await Settings.updateOne(
        { _id: settings._id, lastAutoFeeMonth: month },
        { $unset: { lastAutoFeeMonth: 1 } }
      );
      throw error;
    }
  },

  /** Record money received at the counter and issue a receipt number for it. */
  async collect(feeId: string, data: CollectFeeInput, actor?: SessionUser) {
    await dbConnect();
    if (!Types.ObjectId.isValid(feeId)) {
      throw new ServiceError("VALIDATION", "Invalid fee voucher ID", 400);
    }
    const amount = round(data.amount);
    const date = data.date ? new Date(data.date) : new Date();
    if (!Number.isFinite(date.getTime())) {
      throw new ServiceError("VALIDATION", "Payment date is invalid", 400);
    }
    const existing = await Fee.findById(feeId).select("amount paidAmount branchCode");
    if (!existing) throw new ServiceError("NOT_FOUND", "Fee voucher not found", 404);
    const balance = round(existing.amount - (existing.paidAmount || 0));
    if (balance <= 0) throw new ServiceError("VALIDATION", "This voucher is already fully paid", 400);
    if (amount > balance) {
      throw new ServiceError("VALIDATION", `Amount is more than the balance due (${balance})`, 400);
    }

    // Atomic balance predicate prevents concurrent counter requests from collecting
    // more than the outstanding amount on the same voucher.
    const receiptNo = await allocateCode("receipt", existing.branchCode);
    const fee = await Fee.findOneAndUpdate(
      {
        _id: feeId,
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ["$paidAmount", 0] }, amount] },
            "$amount",
          ],
        },
      },
      {
        $inc: { paidAmount: amount },
        $push: {
          payments: { amount, date, method: data.method, receiptNo, receivedBy: actor?.name, note: data.note },
        },
        $set: { paymentDate: date, method: data.method, receiptNo },
      },
      { new: true, runValidators: true }
    );
    if (!fee) {
      const latest = await Fee.findById(feeId).select("amount paidAmount");
      if (!latest) throw new ServiceError("NOT_FOUND", "Fee voucher not found", 404);
      const latestBalance = round(latest.amount - (latest.paidAmount || 0));
      throw new ServiceError("VALIDATION", latestBalance <= 0
        ? "This voucher is already fully paid"
        : `Amount is more than the balance due (${latestBalance})`, 400);
    }
    await Fee.updateOne(
      { _id: fee._id, $expr: { $gte: ["$paidAmount", "$amount"] } },
      { $set: { status: "paid" } }
    );
    await Fee.updateOne(
      { _id: fee._id, status: { $ne: "paid" } },
      { $set: { status: "partial" } }
    );
    const updatedFee = await Fee.findById(fee._id);
    if (!updatedFee) throw new ServiceError("NOT_FOUND", "Fee voucher not found after collection", 404);
    await syncFeeLedger(updatedFee);
    return { fee: updatedFee.toObject(), receiptNo };
  },

  /** Challans to print in bulk, with each student's earlier unpaid balance as arrears. */
  async challans(filters: { month?: string; classId?: string; status?: string; ids?: string[] }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.ids?.length) query._id = { $in: filters.ids };
    if (filters.month) query.billingMonth = filters.month;
    if (filters.status === "unpaid") query.status = { $in: ["pending", "partial", "overdue"] };
    if (filters.classId) {
      const students = await Student.find({ classId: filters.classId }).select("_id").lean();
      query.studentId = { $in: students.map((s) => s._id) };
    }
    if (!filters.ids?.length && !filters.month && !filters.classId) {
      throw new ServiceError("VALIDATION", "Pick a month or class to print", 400);
    }
    const fees = (await Fee.find(query).populate(studentFields).sort({ dueDate: 1 }).lean()) as unknown as FeeLean[];
    const studentIds = [...new Set(fees.map((f) => String(f.studentId?._id)))];
    const open = (await Fee.find({
      studentId: { $in: studentIds },
      status: { $in: ["pending", "partial", "overdue"] },
    })
      .select("studentId amount paidAmount dueDate")
      .lean()) as unknown as { _id: Types.ObjectId; studentId: Types.ObjectId; amount: number; paidAmount: number; dueDate: Date }[];

    const list = fees
      .filter((f) => f.studentId)
      .map((f) => {
        const arrears = round(
          open
            .filter(
              (o) =>
                String(o.studentId) === String(f.studentId!._id) &&
                String(o._id) !== String(f._id) &&
                o.dueDate < f.dueDate
            )
            .reduce((s, o) => s + (o.amount - (o.paidAmount || 0)), 0)
        );
        const balance = round(f.amount - (f.paidAmount || 0));
        return {
          _id: String(f._id),
          challanNo: `CH-${String(f._id).slice(-6).toUpperCase()}`,
          title: f.title,
          billingMonth: f.billingMonth || null,
          dueDate: f.dueDate,
          status: f.status,
          lines: f.lines?.length ? f.lines : [{ head: f.title, amount: f.amount }],
          gross: f.originalAmount ?? f.amount,
          discountAmount: f.discountAmount || 0,
          discountLabel: f.discountType && f.discountType !== "none" ? `${f.discountType} ${f.discountPercent || 0}%` : "",
          amount: f.amount,
          paid: f.paidAmount || 0,
          balance,
          arrears,
          payable: round(balance + arrears),
          student: {
            name: `${f.studentId!.firstName} ${f.studentId!.lastName}`,
            admissionNo: f.studentId!.admissionNo,
            rollNo: f.studentId!.rollNumber || "",
            fatherName: f.studentId!.parentName || "",
            phone: f.studentId!.parentPhone || "",
            classLabel: classLabel(f.studentId!.classId),
          },
        };
      })
      .sort((a, b) => a.student.classLabel.localeCompare(b.student.classLabel, undefined, { numeric: true }) || a.student.rollNo.localeCompare(b.student.rollNo, undefined, { numeric: true }) || a.student.name.localeCompare(b.student.name));
    return { school: await schoolHeader(), challans: list };
  },

  /** One payment receipt (latest payment unless a receipt number is given). */
  async receipt(feeId: string, receiptNo?: string | null) {
    await dbConnect();
    if (!Types.ObjectId.isValid(feeId)) {
      throw new ServiceError("VALIDATION", "Invalid fee voucher ID", 400);
    }
    const fee = (await Fee.findById(feeId).populate(studentFields).lean()) as unknown as FeeLean | null;
    if (!fee || !fee.studentId) throw new ServiceError("NOT_FOUND", "Fee voucher not found", 404);
    // Vouchers paid before counter collection existed have no payment rows — show the paid total.
    const payments: IFeePayment[] = fee.payments?.length
      ? fee.payments
      : fee.paidAmount > 0
        ? [{
            amount: fee.paidAmount,
            date: fee.paymentDate || new Date(),
            method: fee.method || "cash",
            receiptNo: fee.receiptNo || `FEE-${String(fee._id).slice(-6).toUpperCase()}`,
          }]
        : [];
    if (!payments.length) throw new ServiceError("VALIDATION", "No payment has been recorded on this voucher", 400);
    const index = receiptNo ? payments.findIndex((p) => p.receiptNo === receiptNo) : payments.length - 1;
    if (index < 0) throw new ServiceError("NOT_FOUND", "Receipt not found on this voucher", 404);
    const payment = payments[index];
    const paidBefore = round(payments.slice(0, index).reduce((s, p) => s + p.amount, 0));
    const paidAfter = round(paidBefore + payment.amount);
    return {
      school: await schoolHeader(),
      receipt: {
        receiptNo: payment.receiptNo,
        date: payment.date,
        method: payment.method,
        receivedBy: payment.receivedBy || "",
        note: payment.note || "",
        amount: payment.amount,
      },
      fee: {
        _id: String(fee._id),
        title: fee.title,
        billingMonth: fee.billingMonth || null,
        dueDate: fee.dueDate,
        lines: fee.lines?.length ? fee.lines : [{ head: fee.title, amount: fee.amount }],
        discountAmount: fee.discountAmount || 0,
        amount: fee.amount,
        paidBefore,
        paidAfter,
        balance: round(fee.amount - paidAfter),
      },
      student: {
        name: `${fee.studentId.firstName} ${fee.studentId.lastName}`,
        admissionNo: fee.studentId.admissionNo,
        rollNo: fee.studentId.rollNumber || "",
        fatherName: fee.studentId.parentName || "",
        classLabel: classLabel(fee.studentId.classId),
      },
    };
  },
};

export { currentMonth, monthLabel };
