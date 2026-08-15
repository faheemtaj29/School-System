/**
 * Printable / exportable reports from live data.
 */
import { dbConnect } from "@/backend/config/database";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { Fee } from "@/backend/models/Fee";
import { Attendance } from "@/backend/models/Attendance";
import { Exam } from "@/backend/models/Exam";
import { ClassModel } from "@/backend/models/Class";
import { LedgerEntry } from "@/backend/models/Ledger";
import { InventoryItem } from "@/backend/models/Inventory";
import { Payslip } from "@/backend/models/HR";

export const reportsService = {
  async studentsByClass() {
    await dbConnect();
    return Student.aggregate([
      {
        $lookup: {
          from: "classes",
          localField: "classId",
          foreignField: "_id",
          as: "class",
        },
      },
      { $unwind: { path: "$class", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$classId",
          className: { $first: { $concat: ["$class.name", "-", "$class.section"] } },
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        },
      },
      { $sort: { className: 1 } },
    ]);
  },

  async feeDefaulters() {
    await dbConnect();
    return Fee.find({ status: { $in: ["pending", "partial", "overdue"] } })
      .populate({
        path: "studentId",
        select: "firstName lastName admissionNo classId phone parentPhone",
        populate: { path: "classId", select: "name section" },
      })
      .sort({ dueDate: 1 })
      .lean();
  },

  async attendanceSummary() {
    await dbConnect();
    const sheets = await Attendance.find()
      .sort({ date: -1 })
      .limit(30)
      .populate("classId", "name section")
      .lean();

    return sheets.map((s) => {
      const total = s.records?.length ?? 0;
      const present = s.records?.filter((r: { status: string }) => r.status === "present").length ?? 0;
      return {
        _id: s._id,
        date: s.date,
        classId: s.classId,
        total,
        present,
        rate: total ? Math.round((present / total) * 100) : 0,
      };
    });
  },

  async examOverview() {
    await dbConnect();
    return Exam.find()
      .populate("classId", "name section")
      .populate("subjectId", "name code")
      .sort({ date: -1 })
      .limit(20)
      .lean();
  },

  async staffDirectory() {
    await dbConnect();
    return Teacher.find().sort({ firstName: 1 }).lean();
  },

  async classStrength() {
    await dbConnect();
    const classes = await ClassModel.find().sort({ name: 1, section: 1 }).lean();
    const counts = await Student.aggregate([
      { $group: { _id: "$classId", count: { $sum: 1 } } },
    ]);
    const map = new Map(counts.map((c) => [String(c._id), c.count]));
    return classes.map((c) => ({
      ...c,
      enrolled: map.get(String(c._id)) ?? 0,
    }));
  },

  async financeSnapshot() {
    await dbConnect();
    const [fees, ledger, payroll, stock, bySource] = await Promise.all([
      Fee.aggregate([
        {
          $group: {
            _id: null,
            billed: { $sum: "$amount" },
            collected: { $sum: "$paidAmount" },
          },
        },
      ]),
      LedgerEntry.aggregate([
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
            tax: { $sum: "$taxAmount" },
          },
        },
      ]),
      Payslip.aggregate([
        { $group: { _id: "$status", total: { $sum: "$net" } } },
      ]),
      InventoryItem.aggregate([
        { $group: { _id: null, v: { $sum: { $multiply: ["$quantity", "$unitCost"] } } } },
      ]),
      LedgerEntry.aggregate([
        {
          $group: {
            _id: "$sourceType",
            income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
            expense: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          },
        },
      ]),
    ]);
    const income = ledger.find((r) => r._id === "income")?.total ?? 0;
    const expense = ledger.find((r) => r._id === "expense")?.total ?? 0;
    const taxCollected = ledger.reduce((s, r) => s + (r.tax || 0), 0);
    const sources: Record<string, { income: number; expense: number }> = {};
    for (const s of bySource) {
      sources[s._id || "manual"] = { income: s.income, expense: s.expense };
    }
    return {
      fees: fees[0] ?? { billed: 0, collected: 0 },
      ledger: { income, expense, balance: income - expense, taxCollected },
      payroll: {
        paid: payroll.find((r) => r._id === "paid")?.total ?? 0,
        pending: payroll.find((r) => r._id === "pending")?.total ?? 0,
      },
      inventoryValue: stock[0]?.v ?? 0,
      bySource: sources,
      integrated: true,
    };
  },

  async inventoryReport() {
    await dbConnect();
    return InventoryItem.find().sort({ category: 1, name: 1 }).lean();
  },
};
