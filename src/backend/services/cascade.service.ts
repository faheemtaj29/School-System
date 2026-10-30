/**
 * Deleting a person removes them everywhere: a student's challans, receipts and their
 * accounting entries, attendance marks, exam marks, enrolments and logins; a teacher's
 * payslips (and salary entries), leave, timetable periods and login. References that other
 * records still need (class teacher, invigilator, course teacher) are cleared, not deleted.
 * `impact` counts what will go so the screen can ask for confirmation first.
 */
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { Voucher } from "@/backend/models/Accounting";
import { Attendance } from "@/backend/models/Attendance";
import { HostelAllocation, TimetableSlot } from "@/backend/models/CampusModules";
import { ClassModel } from "@/backend/models/Class";
import { Course, Diploma, Enrollment, Lecture, QuizAttempt } from "@/backend/models/ELearning";
import { Exam } from "@/backend/models/Exam";
import { ExamMark, ExamSchedule } from "@/backend/models/ExamWorkflow";
import { Fee } from "@/backend/models/Fee";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { LedgerEntry, type LedgerSource } from "@/backend/models/Ledger";
import { MessageLog } from "@/backend/models/Messaging";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { User } from "@/backend/models/User";
import { ServiceError } from "@/backend/types";

/** Deletes the vouchers and ledger lines posted for these records (including per-receipt ones, `id:receipt`). */
async function purgePostings(sourceType: LedgerSource, ids: string[]) {
  if (!ids.length) return 0;
  const match = { sourceType, $or: [{ sourceId: { $in: ids } }, { sourceId: { $regex: `^(${ids.join("|")}):` } }] };
  const [v] = await Promise.all([Voucher.deleteMany(match), LedgerEntry.deleteMany(match)]);
  return v.deletedCount || 0;
}

const oid = (id: string) => new Types.ObjectId(id);

export const cascadeService = {
  async studentImpact(id: string) {
    await dbConnect();
    const student = await Student.findById(id).select("firstName lastName").lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    const [fees, paid, attendance, marks] = await Promise.all([
      Fee.countDocuments({ studentId: id }),
      Fee.countDocuments({ studentId: id, paidAmount: { $gt: 0 } }),
      Attendance.countDocuments({ "records.studentId": oid(id) }),
      ExamMark.countDocuments({ studentId: id }),
    ]);
    return { name: `${student.firstName} ${student.lastName}`, fees, paidFees: paid, attendanceDays: attendance, examMarks: marks };
  },

  async removeStudent(id: string) {
    await dbConnect();
    const student = await Student.findById(id).lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    const sid = oid(id);
    const feeIds = (await Fee.find({ studentId: id }).select("_id").lean()).map((f) => String(f._id));
    const vouchers = await purgePostings("fee", feeIds);
    const [fees, attendance, marks] = await Promise.all([
      Fee.deleteMany({ studentId: id }),
      Attendance.updateMany({ "records.studentId": sid }, { $pull: { records: { studentId: sid } } }),
      ExamMark.deleteMany({ studentId: id }),
      Exam.updateMany({ "results.studentId": sid }, { $pull: { results: { studentId: sid } } }),
      Enrollment.deleteMany({ studentId: id }),
      Diploma.deleteMany({ studentId: id }),
      QuizAttempt.deleteMany({ studentId: id }),
      HostelAllocation.deleteMany({ studentId: id }),
      MessageLog.deleteMany({ studentId: id }),
    ]);
    // Sheets left with nobody on them are removed too.
    await Attendance.deleteMany({ records: { $size: 0 } });
    const logins: unknown[] = [];
    if (student.user) logins.push(student.user);
    if (student.parentUser) {
      const siblings = await Student.countDocuments({ parentUser: student.parentUser, _id: { $ne: student._id } });
      if (!siblings) logins.push(student.parentUser);
    }
    if (logins.length) await User.deleteMany({ _id: { $in: logins }, role: { $in: ["student", "parent"] } });
    await Student.deleteOne({ _id: student._id });
    return {
      ok: true,
      removed: { fees: fees.deletedCount || 0, vouchers, attendanceSheets: attendance.modifiedCount || 0, examMarks: marks.deletedCount || 0, logins: logins.length },
    };
  },

  async teacherImpact(id: string) {
    await dbConnect();
    const teacher = await Teacher.findById(id).select("firstName lastName").lean();
    if (!teacher) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    const [payslips, leaves, periods, classes] = await Promise.all([
      Payslip.countDocuments({ teacherId: id }),
      LeaveRequest.countDocuments({ teacherId: id }),
      TimetableSlot.countDocuments({ teacherId: id }),
      ClassModel.countDocuments({ classTeacher: id }),
    ]);
    return { name: `${teacher.firstName} ${teacher.lastName}`, payslips, leaves, timetablePeriods: periods, classTeacherOf: classes };
  },

  async removeTeacher(id: string) {
    await dbConnect();
    const teacher = await Teacher.findById(id).lean();
    if (!teacher) throw new ServiceError("NOT_FOUND", "Teacher not found", 404);
    const tid = oid(id);
    const slipIds = (await Payslip.find({ teacherId: id }).select("_id").lean()).map((p) => String(p._id));
    const vouchers = await purgePostings("payslip", slipIds);
    const [payslips, leaves, periods] = await Promise.all([
      Payslip.deleteMany({ teacherId: id }),
      LeaveRequest.deleteMany({ teacherId: id }),
      TimetableSlot.deleteMany({ teacherId: id }),
      ClassModel.updateMany({ classTeacher: tid }, { $unset: { classTeacher: "" } }),
      Exam.updateMany({ teacherId: tid }, { $unset: { teacherId: "" } }),
      Course.updateMany({ teacherId: tid }, { $unset: { teacherId: "" } }),
      Lecture.updateMany({ teacherId: tid }, { $unset: { teacherId: "" } }),
      ExamSchedule.updateMany(
        { "rows.invigilatorId": tid },
        { $unset: { "rows.$[r].invigilatorId": "" } },
        { arrayFilters: [{ "r.invigilatorId": tid }] }
      ),
    ]);
    if (teacher.user) await User.deleteMany({ _id: teacher.user, role: "teacher" });
    await Teacher.deleteOne({ _id: teacher._id });
    return {
      ok: true,
      removed: { payslips: payslips.deletedCount || 0, vouchers, leaves: leaves.deletedCount || 0, timetablePeriods: periods.deletedCount || 0, login: teacher.user ? 1 : 0 },
    };
  },
};
