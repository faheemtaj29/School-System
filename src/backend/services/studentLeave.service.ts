import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { resolveChildren, resolveTeacher } from "@/backend/lib/portal";
import { ClassModel } from "@/backend/models/Class";
import { Student } from "@/backend/models/Student";
import { StudentLeaveRequest } from "@/backend/models/StudentLeave";
import { ServiceError, type SessionUser } from "@/backend/types";

const LEAVE_TYPES = ["casual", "sick", "annual", "unpaid", "other"] as const;
type LeaveType = (typeof LEAVE_TYPES)[number];

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ServiceError("VALIDATION", "Choose valid leave dates.", 400);
  }
  return date;
}

export const studentLeaveService = {
  async listForStudent(studentId: string) {
    await dbConnect();
    return StudentLeaveRequest.find({ studentId }).sort({ createdAt: -1 }).lean();
  },

  async listAll() {
    await dbConnect();
    return StudentLeaveRequest.find()
      .populate({ path: "studentId", select: "firstName lastName admissionNo classId", populate: { path: "classId", select: "name section" } })
      .sort({ createdAt: -1 })
      .lean();
  },

  async create(input: { studentId: string; leaveType: string; fromDate: string; toDate: string; reason?: string }, session: SessionUser) {
    await dbConnect();
    if (!isValidObjectId(input.studentId)) throw new ServiceError("VALIDATION", "Invalid student.", 400);
    if (!LEAVE_TYPES.includes(input.leaveType as LeaveType)) throw new ServiceError("VALIDATION", "Choose a valid leave type.", 400);
    const fromDate = parseDate(input.fromDate);
    const toDate = parseDate(input.toDate);
    if (toDate < fromDate) throw new ServiceError("VALIDATION", "The end date must be on or after the start date.", 400);
    const student = await Student.findById(input.studentId).select("_id").lean();
    if (!student) throw new ServiceError("NOT_FOUND", "Student not found.", 404);
    if (session.role === "student" || session.role === "parent") {
      const children = await resolveChildren(session);
      if (!children.some((child) => String(child._id) === input.studentId)) {
        throw new ServiceError("FORBIDDEN", "You can only request leave for your linked student profile.", 403);
      }
    } else if (session.role !== "admin") {
      throw new ServiceError("FORBIDDEN", "You cannot submit student leave requests.", 403);
    }
    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    return StudentLeaveRequest.create({
      studentId: student._id,
      leaveType: input.leaveType,
      fromDate,
      toDate,
      days,
      reason: input.reason?.trim(),
      submittedBy: session.id,
    });
  },

  async updateStatus(id: string, status: "approved" | "rejected", reviewedBy: string) {
    await dbConnect();
    if (!isValidObjectId(id)) throw new ServiceError("VALIDATION", "Invalid leave request.", 400);
    const leave = await StudentLeaveRequest.findByIdAndUpdate(
      id,
      { status, reviewedBy },
      { new: true, runValidators: true }
    ).populate({ path: "studentId", select: "firstName lastName admissionNo classId", populate: { path: "classId", select: "name section" } });
    if (!leave) throw new ServiceError("NOT_FOUND", "Leave request not found.", 404);
    return leave;
  },

  async approvedForClassDate(classId: string, date: string, session: SessionUser) {
    await dbConnect();
    if (!isValidObjectId(classId)) throw new ServiceError("VALIDATION", "Choose a valid class.", 400);
    const day = parseDate(date);
    const end = new Date(day.getTime() + 86_400_000 - 1);
    if (session.role === "teacher") {
      const teacher = await resolveTeacher(session);
      const classRecord = await ClassModel.findById(classId).select("classTeacher").lean();
      const assigned = teacher?.classes?.some((id: unknown) => String(id) === classId);
      if (!teacher || (!assigned && String(classRecord?.classTeacher || "") !== String(teacher._id))) {
        throw new ServiceError("FORBIDDEN", "You are not assigned to this class.", 403);
      }
    } else if (!["admin", "staff"].includes(session.role)) {
      throw new ServiceError("FORBIDDEN", "You cannot view leave requests for this class.", 403);
    }
    const students = await Student.find({ classId }).distinct("_id");
    return StudentLeaveRequest.find({
      studentId: { $in: students },
      status: "approved",
      fromDate: { $lte: end },
      toDate: { $gte: day },
    }).select("studentId leaveType reason fromDate toDate").lean();
  },
};
