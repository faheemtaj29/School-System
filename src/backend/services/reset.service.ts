/**
 * "Start fresh": clears day-to-day records (sample or old students, fees, vouchers…) while the
 * school's setup stays — profile, campuses, classes, subjects, sessions, fee structure, chart of
 * accounts, parties, exam types, workflows, inventory items and the admin login.
 */
import { dbConnect } from "@/backend/config/database";
import { AccountingCounter, Voucher } from "@/backend/models/Accounting";
import { Attendance } from "@/backend/models/Attendance";
import { ClassModel } from "@/backend/models/Class";
import { Diploma, Enrollment, QuizAttempt } from "@/backend/models/ELearning";
import { Exam } from "@/backend/models/Exam";
import { ExamMark, ExamSchedule, ExamTerm } from "@/backend/models/ExamWorkflow";
import { Fee } from "@/backend/models/Fee";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { InventoryItem, StockVoucher } from "@/backend/models/Inventory";
import { LedgerEntry } from "@/backend/models/Ledger";
import { MessageLog } from "@/backend/models/Messaging";
import { Notice } from "@/backend/models/Notice";
import { WorkflowInstance } from "@/backend/models/Platform";
import { Settings } from "@/backend/models/Settings";
import { Admission } from "@/backend/models/Site";
import { Staff } from "@/backend/models/Staff";
import { StockLedger, WhatsAppMessage } from "@/backend/models/AiModels";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { User } from "@/backend/models/User";
import {
  CafeSale,
  HostelAllocation,
  LibraryLoan,
  MedicalVisit,
  TimetableSlot,
} from "@/backend/models/CampusModules";
import { ServiceError, type SessionUser } from "@/backend/types";

export const RESET_GROUPS = [
  { key: "students", label: "Students & parent logins", note: "also their fee challans, attendance, exam marks and admission applications" },
  { key: "fees", label: "Fee challans & receipts", note: "and the fee entries in accounts" },
  { key: "accounting", label: "Accounting vouchers", note: "every voucher and ledger entry; the chart of accounts stays" },
  { key: "exams", label: "Exam terms, date sheets & marks", note: "exam types stay" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payslips & leave" },
  { key: "inventory", label: "Stock vouchers & stock balances", note: "items stay, quantities go back to zero" },
  { key: "messages", label: "Messages, notices & approvals" },
  { key: "campus", label: "Library loans, canteen sales, medical & hostel records" },
  { key: "elearning", label: "Course enrolments, quiz attempts & diplomas", note: "courses and lectures stay" },
  { key: "teachers", label: "Teachers & campus staff", note: "and their logins, payslips and leave" },
] as const;

export type ResetGroup = (typeof RESET_GROUPS)[number]["key"];

const VOUCHER_PREFIXES = ["JV", "RV", "PV", "CV", "SI", "PI", "CPV", "BPV", "CRV", "BRV", "EXP"];
const STOCK_PREFIXES = ["PINV", "SINV", "PRTN", "SRTN", "STRF", "SADJ"];

/** Removes numbering counters (PREFIX:CAMPUS:YEAR) so the cleared series start again at 00001. */
async function resetCounters(prefixes: string[]) {
  if (!prefixes.length) return 0;
  const pattern = new RegExp(`^(${prefixes.map((p) => p.replace(/[^A-Z0-9]/gi, "")).join("|")}):`, "i");
  const r = await AccountingCounter.deleteMany({ _id: { $regex: pattern } });
  return r.deletedCount || 0;
}

export const resetService = {
  groups() {
    return RESET_GROUPS;
  },

  /** How many records each group would clear (shown before confirming). */
  async preview() {
    await dbConnect();
    const [students, fees, vouchers, terms, sheets, payslips, stock, messages, teachers] = await Promise.all([
      Student.countDocuments(),
      Fee.countDocuments(),
      Voucher.countDocuments(),
      ExamTerm.countDocuments(),
      Attendance.countDocuments(),
      Payslip.countDocuments(),
      StockVoucher.countDocuments(),
      MessageLog.countDocuments(),
      Teacher.countDocuments(),
    ]);
    return { students, fees, vouchers, terms, attendance: sheets, payslips, stock, messages, teachers };
  },

  async run(groups: ResetGroup[], session: SessionUser) {
    await dbConnect();
    const want = new Set(groups);
    if (!want.size) throw new ServiceError("VALIDATION", "Tick at least one thing to clear", 400);
    // Records that belong to students cannot outlive them.
    if (want.has("students")) {
      want.add("fees");
      want.add("attendance");
    }
    // Fee entries in the accounts go with the fees.
    const settings = await Settings.findOne().select("admissionPrefix receiptPrefix").lean();
    const counters: string[] = [];
    const done: Record<string, number> = {};
    const count = (key: string, n?: number) => (done[key] = (done[key] || 0) + (n || 0));

    if (want.has("students")) {
      count("students", (await Student.deleteMany({})).deletedCount);
      count("portal logins", (await User.deleteMany({ role: { $in: ["student", "parent"] } })).deletedCount);
      count("admission applications", (await Admission.deleteMany({})).deletedCount);
      count("exam marks", (await ExamMark.deleteMany({})).deletedCount);
      count("class tests", (await Exam.deleteMany({})).deletedCount);
      counters.push(settings?.admissionPrefix || "STD");
    }
    if (want.has("fees")) {
      count("fee challans", (await Fee.deleteMany({})).deletedCount);
      if (!want.has("accounting")) {
        count("fee vouchers", (await Voucher.deleteMany({ sourceType: "fee" })).deletedCount);
        count("fee ledger entries", (await LedgerEntry.deleteMany({ sourceType: "fee" })).deletedCount);
      }
      counters.push(settings?.receiptPrefix || "RCT");
    }
    if (want.has("accounting")) {
      count("vouchers", (await Voucher.deleteMany({})).deletedCount);
      count("ledger entries", (await LedgerEntry.deleteMany({})).deletedCount);
      counters.push(...VOUCHER_PREFIXES);
    }
    if (want.has("exams")) {
      count("exam terms", (await ExamTerm.deleteMany({})).deletedCount);
      count("date sheets", (await ExamSchedule.deleteMany({})).deletedCount);
      count("exam marks", (await ExamMark.deleteMany({})).deletedCount);
      count("class tests", (await Exam.deleteMany({})).deletedCount);
    }
    if (want.has("attendance")) count("attendance sheets", (await Attendance.deleteMany({})).deletedCount);
    if (want.has("payroll") || want.has("teachers")) {
      count("payslips", (await Payslip.deleteMany({})).deletedCount);
      count("leave requests", (await LeaveRequest.deleteMany({})).deletedCount);
      if (!want.has("accounting")) {
        count("payroll vouchers", (await Voucher.deleteMany({ sourceType: "payslip" })).deletedCount);
        await LedgerEntry.deleteMany({ sourceType: "payslip" });
      }
    }
    if (want.has("inventory")) {
      count("stock vouchers", (await StockVoucher.deleteMany({})).deletedCount);
      count("stock ledger rows", (await StockLedger.deleteMany({})).deletedCount);
      await InventoryItem.updateMany({}, { $set: { quantity: 0, stock: [], status: "out_of_stock" } });
      if (!want.has("accounting")) {
        count("stock journal vouchers", (await Voucher.deleteMany({ sourceType: "inventory" })).deletedCount);
        await LedgerEntry.deleteMany({ sourceType: "inventory" });
      }
      counters.push(...STOCK_PREFIXES);
    }
    if (want.has("messages")) {
      count("message log", (await MessageLog.deleteMany({})).deletedCount);
      count("WhatsApp chats", (await WhatsAppMessage.deleteMany({})).deletedCount);
      count("notices", (await Notice.deleteMany({})).deletedCount);
      count("approval requests", (await WorkflowInstance.deleteMany({})).deletedCount);
    }
    if (want.has("campus")) {
      count("library loans", (await LibraryLoan.deleteMany({})).deletedCount);
      count("canteen sales", (await CafeSale.deleteMany({})).deletedCount);
      count("medical visits", (await MedicalVisit.deleteMany({})).deletedCount);
      count("hostel allocations", (await HostelAllocation.deleteMany({})).deletedCount);
    }
    if (want.has("elearning")) {
      count("enrolments", (await Enrollment.deleteMany({})).deletedCount);
      count("quiz attempts", (await QuizAttempt.deleteMany({})).deletedCount);
      count("diplomas", (await Diploma.deleteMany({})).deletedCount);
    }
    if (want.has("teachers")) {
      count("teachers", (await Teacher.deleteMany({})).deletedCount);
      count("campus staff", (await Staff.deleteMany({})).deletedCount);
      count("staff logins", (await User.deleteMany({ role: { $in: ["teacher", "staff"] } })).deletedCount);
      await ClassModel.updateMany({}, { $unset: { classTeacher: 1 } });
      await TimetableSlot.deleteMany({});
      counters.push("TCH", "EMP");
    }
    count("number series restarted", await resetCounters(counters));
    // Opening balances typed on accounts stay: they are setup, not transactions.
    const { platformService } = await import("@/backend/services/platform.service");
    await platformService
      .audit({ session, action: "data.reset", entity: "settings", summary: `Start fresh: cleared ${[...want].join(", ")}`, after: done })
      .catch(() => null);
    return { cleared: [...want], counts: done };
  },
};
