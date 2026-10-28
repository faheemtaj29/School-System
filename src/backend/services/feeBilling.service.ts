/**
 * Monthly fee billing — class fee structures, automatic monthly challans,
 * counter collection with receipts, and data for printing challans / receipts.
 */
import { letterhead, letterheads } from "@/backend/lib/letterhead";
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Fee, type IFeePayment } from "@/backend/models/Fee";
import { Settings } from "@/backend/models/Settings";
import { Student } from "@/backend/models/Student";
import { allocateCode } from "@/backend/services/numbering.service";
import { feeService, newBatch, syncFeeLedger } from "@/backend/services/fee.service";
import { ServiceError, type SessionUser } from "@/backend/types";
import type { AdvanceFeeInput, CollectFeeInput, FeeStructureInput } from "@/backend/validators/fee.validator";

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

import { DEFAULT_CHALLAN_TERMS } from "@/lib/challanTerms";
import { challanToken } from "@/backend/lib/challanLink";

/** Head-wise split in whole rupees that still adds up to the total (the largest head takes the rounding). */
function wholeRupees(parts: { label: string; amount: number }[], total: number) {
  const out = parts.map((p) => ({ label: p.label, amount: Math.round(p.amount) })).sort((a, b) => b.amount - a.amount);
  if (out.length) out[0].amount = round(out[0].amount + total - out.reduce((t, p) => t + p.amount, 0));
  return out;
}

const lines = (text?: string | null) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);

/** Fee settings plus the letterhead of one campus (the default campus when none is given). */
async function schoolHeader(branchCode?: string | null) {
  const s = await Settings.findOne()
    .select("lateFeePercent lateFeeGraceDays challanValidityDays challanBanks challanNotes branches defaultBranchCode")
    .lean();
  const head = await letterhead(branchCode);
  return {
    name: head.name,
    campus: head.campus,
    address: head.address,
    phone: head.phone,
    email: head.email,
    registrationNo: head.registrationNo,
    currency: head.currency,
    lateFeePercent: s?.lateFeePercent ?? 0,
    lateFeeGraceDays: s?.lateFeeGraceDays ?? 0,
    challanValidityDays: s?.challanValidityDays ?? 5,
    banks: lines(s?.challanBanks),
    // Until the school writes its own, the standard terms are printed.
    notes: lines(s?.challanNotes || DEFAULT_CHALLAN_TERMS),
    branches: (s?.branches || []).map((b: { code: string; name: string }) => ({ code: b.code, name: b.name })),
    defaultBranchCode: s?.defaultBranchCode || "",
    logoUrl: head.logoUrl,
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
  lateFeeApplied?: boolean;
  createdAt?: Date;
  branchCode?: string;
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
    // One batch for the whole run, so its challans can be printed / sent together afterwards.
    const issueBatch = newBatch();

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
          issueBatch,
        });
        created += r.created;
        skipped += r.skipped;
        billed += r.billedAmount;
        results.push({ classLabel: classLabel(cls), created: r.created, skipped: r.skipped });
      } catch (e) {
        // A class without active students is not an error for a whole-school run.
        // Keep internal database/error details out of the API response.
        console.error("[fees] monthly billing failed for class", {
          classId: String(cls._id),
          error: e,
        });
        results.push({
          classLabel: classLabel(cls),
          created: 0,
          skipped: 0,
          note: "Billing failed for this class. Check server logs and retry.",
        });
      }
    }
    return { month, monthLabel: monthLabel(month), dueDate, classes: results, created, skipped, billedAmount: round(billed), issueBatch };
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
  /**
   * Fee paid in advance: the coming months' challans are raised now from the class fee
   * structure (concession applied) and paid together under one receipt number. Monthly
   * billing later finds those months already billed and skips them.
   */
  async advance(input: AdvanceFeeInput, actor?: SessionUser) {
    await dbConnect();
    if (!Types.ObjectId.isValid(input.studentId)) throw new ServiceError("VALIDATION", "Invalid student", 400);
    const student = await Student.findById(input.studentId).select("classId status branchCode firstName lastName").lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    if (student.status !== "active") throw new ServiceError("VALIDATION", "Only an active student can pay in advance", 400);
    const cls = await ClassModel.findById(student.classId).select("name section feeStructure").lean();
    if (!cls?.feeStructure?.length) {
      throw new ServiceError("VALIDATION", "Set this class's monthly fee first (Fees → Fee Structure & Monthly Billing)", 400);
    }
    const settings = await Settings.findOne().select("feeDueDay").lean();
    const dueDay = Math.min(28, settings?.feeDueDay || 10);
    const [y0, m0] = input.fromMonth.split("-").map(Number);
    const months = Array.from({ length: input.months }, (_, i) => {
      const d = new Date(Date.UTC(y0, m0 - 1 + i, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    });
    for (const month of months) {
      await feeService.generateBulk({
        classId: String(cls._id),
        studentId: input.studentId,
        lines: cls.feeStructure,
        title: `Monthly Fee · ${monthLabel(month)}`,
        dueDate: `${month}-${String(dueDay).padStart(2, "0")}`,
        billingMonth: month,
      });
    }
    const fees = await Fee.find({ studentId: input.studentId, billingMonth: { $in: months } })
      .select("billingMonth amount paidAmount branchCode")
      .sort({ billingMonth: 1 })
      .lean();
    const open = fees.filter((f) => round(f.amount - (f.paidAmount || 0)) > 0);
    if (!open.length) throw new ServiceError("VALIDATION", "These months are already paid", 400);
    const receiptNo = await allocateCode("receipt", open[0].branchCode || student.branchCode);
    const note = input.note || `Advance fee — ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])}`;
    const paid = [];
    for (const [i, f] of open.entries()) {
      const amount = round(f.amount - (f.paidAmount || 0));
      // One receipt for the whole advance; each month carries it as /1, /2 … (receipt numbers are unique per challan).
      const monthReceipt = open.length > 1 ? `${receiptNo}/${i + 1}` : receiptNo;
      await this.collect(String(f._id), { amount, method: input.method, date: input.date, note }, actor, monthReceipt);
      paid.push({ month: f.billingMonth, monthLabel: monthLabel(f.billingMonth!), amount, feeId: String(f._id) });
    }
    return {
      receiptNo,
      months: paid,
      alreadyPaid: fees.length - open.length,
      total: round(paid.reduce((t, p) => t + p.amount, 0)),
    };
  },

  async collect(feeId: string, data: CollectFeeInput, actor?: SessionUser, sharedReceiptNo?: string) {
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
    // Advance payments for several months use one receipt number (see advance()).
    const receiptNo = sharedReceiptNo || (await allocateCode("receipt", existing.branchCode));
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
    let ledgerSyncPending = false;
    try {
      // Ledger posting is idempotent by source type + fee ID. Do not make the
      // caller repeat a successful collection if accounting is temporarily unavailable.
      await syncFeeLedger(updatedFee);
    } catch (error) {
      ledgerSyncPending = true;
      console.error("[fees] payment saved but ledger synchronization failed", {
        feeId: String(updatedFee._id),
        receiptNo,
        error,
      });
    }
    return { fee: updatedFee.toObject(), receiptNo, ledgerSyncPending };
  },

  /**
   * Fee collection report (daily cash closing): every payment received between two dates,
   * with totals by method, by day, by fee head and by class.
   */
  async collections(filters: { from: string; to: string; method?: string; classId?: string; branch?: string }) {
    await dbConnect();
    const from = new Date(`${filters.from}T00:00:00.000Z`);
    const to = new Date(`${filters.to}T23:59:59.999Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new ServiceError("VALIDATION", "Choose a valid date range", 400);
    }
    // Older vouchers were paid before counter receipts existed: they only carry paidAmount + paymentDate.
    const query: Record<string, unknown> = {
      $or: [
        { "payments.date": { $gte: from, $lte: to } },
        { "payments.0": { $exists: false }, paidAmount: { $gt: 0 }, paymentDate: { $gte: from, $lte: to } },
      ],
    };
    if (filters.branch) query.branchCode = filters.branch.toUpperCase();
    if (filters.classId && Types.ObjectId.isValid(filters.classId)) {
      const ids = await Student.find({ classId: filters.classId }).select("_id").lean();
      query.studentId = { $in: ids.map((x) => x._id) };
    }
    const fees = (await Fee.find(query).populate(studentFields).lean()) as unknown as FeeLean[];

    const rows: {
      date: Date; receiptNo: string; feeId: string; student: string; admissionNo: string; classLabel: string;
      title: string; method: string; amount: number; receivedBy: string;
    }[] = [];
    const byHead = new Map<string, number>();
    for (const f of fees) {
      const lines = (f.lines?.length ? f.lines : [{ head: f.title, amount: f.amount }]).filter((l) => l.amount > 0);
      const weight = lines.reduce((t, l) => t + l.amount, 0);
      const payments = f.payments?.length
        ? f.payments
        : f.paidAmount && f.paymentDate
          ? [{ amount: f.paidAmount, date: f.paymentDate, method: f.method || "cash", receiptNo: f.receiptNo || `FEE-${String(f._id).slice(-6).toUpperCase()}` }]
          : [];
      for (const p of payments) {
        const d = new Date(p.date);
        if (d < from || d > to) continue;
        if (filters.method && p.method !== filters.method) continue;
        rows.push({
          date: d,
          receiptNo: p.receiptNo,
          feeId: String(f._id),
          student: f.studentId ? `${f.studentId.firstName} ${f.studentId.lastName}` : "—",
          admissionNo: f.studentId?.admissionNo || "",
          classLabel: classLabel(f.studentId?.classId),
          title: f.title,
          method: p.method,
          amount: round(p.amount),
          receivedBy: (p as { receivedBy?: string }).receivedBy || "",
        });
        // Each payment is spread over the challan's heads the same way the ledger posts it.
        for (const l of lines) {
          byHead.set(l.head, round((byHead.get(l.head) || 0) + (weight ? (p.amount * l.amount) / weight : 0)));
        }
      }
    }
    rows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.receiptNo.localeCompare(b.receiptNo));
    const sumBy = (key: (r: (typeof rows)[number]) => string) => {
      const m = new Map<string, { count: number; amount: number }>();
      for (const r of rows) {
        const k = key(r);
        const cur = m.get(k) || { count: 0, amount: 0 };
        m.set(k, { count: cur.count + 1, amount: round(cur.amount + r.amount) });
      }
      return [...m.entries()].map(([label, v]) => ({ label, ...v }));
    };
    return {
      school: await schoolHeader(filters.branch),
      from: filters.from,
      to: filters.to,
      rows,
      total: round(rows.reduce((t, r) => t + r.amount, 0)),
      byMethod: sumBy((r) => r.method).sort((a, b) => b.amount - a.amount),
      byDay: sumBy((r) => r.date.toISOString().slice(0, 10)).sort((a, b) => a.label.localeCompare(b.label)),
      byClass: sumBy((r) => r.classLabel || "—").sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
      byHead: wholeRupees([...byHead.entries()].map(([label, amount]) => ({ label, amount })), round(rows.reduce((t, r) => t + r.amount, 0))),
    };
  },

  /** Retry the idempotent accounting projection without collecting money again. */
  async syncLedger(feeId: string) {
    await dbConnect();
    if (!Types.ObjectId.isValid(feeId)) {
      throw new ServiceError("VALIDATION", "Invalid fee voucher ID", 400);
    }
    const fee = await Fee.findById(feeId);
    if (!fee) throw new ServiceError("NOT_FOUND", "Fee voucher not found", 404);
    await syncFeeLedger(fee);
    return { feeId: String(fee._id), synchronized: true };
  },

  /** Challans to print in bulk, with each student's earlier unpaid balance as arrears. */
  async challans(filters: { month?: string; classId?: string; status?: string; ids?: string[]; batch?: string }) {
    await dbConnect();
    const query: Record<string, unknown> = {};
    if (filters.ids?.length) query._id = { $in: filters.ids };
    if (filters.batch) query.issueBatch = filters.batch;
    if (filters.month) query.billingMonth = filters.month;
    if (filters.status === "unpaid") query.status = { $in: ["pending", "partial", "overdue"] };
    if (filters.classId) {
      const students = await Student.find({ classId: filters.classId }).select("_id").lean();
      query.studentId = { $in: students.map((s) => s._id) };
    }
    if (!filters.ids?.length && !filters.month && !filters.classId && !filters.batch) {
      throw new ServiceError("VALIDATION", "Pick a month or class to print", 400);
    }
    const header = await schoolHeader();
    const heads = await letterheads();
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
        let arrears = round(
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
        // A fully paid challan (e.g. paid in advance) doesn't carry older dues — they stay on their own challans.
        if (balance <= 0) arrears = 0;
        const payable = round(balance + arrears);
        // The late fee is added to the voucher only once (Apply Late Fees); until then show what it would be.
        // Whole rupees, as collected at the counter.
        const lateAfterDue = f.lateFeeApplied ? 0 : Math.round((balance * header.lateFeePercent) / 100);
        const expiry = new Date(f.dueDate);
        expiry.setDate(expiry.getDate() + header.challanValidityDays);
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
          payable,
          lateAfterDue,
          payableAfterDue: round(payable + lateAfterDue),
          // Stamped on the challan once money is in: last payment's date, method and receipt.
          lastPayment: (() => {
            const p = f.payments?.length ? f.payments[f.payments.length - 1] : null;
            if (p) return { date: p.date, method: p.method, receiptNo: p.receiptNo };
            return f.paidAmount ? { date: f.paymentDate || null, method: f.method || "cash", receiptNo: f.receiptNo || "" } : null;
          })(),
          // For the QR code / link to this challan's online copy.
          token: challanToken(String(f._id)),
          // Fees saved without a campus belong to the main (default) campus.
          campus: heads(f.branchCode).campus,
          // Each challan carries its own campus letterhead (name, address, phone, logo).
          head: (({ name, campus, address, phone, logoUrl }) => ({ name, campus, address, phone, logoUrl }))(heads(f.branchCode)),
          issueDate: f.createdAt || null,
          expiryDate: expiry,
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
    return { school: header, challans: list };
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
      school: await schoolHeader(fee.branchCode),
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
