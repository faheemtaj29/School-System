/**
 * Distance learning business logic (courses, lectures, enrollments, diplomas).
 */
import { dbConnect } from "@/backend/config/database";
import { Course, Lecture, Enrollment, Diploma } from "@/backend/models/ELearning";
import { Fee } from "@/backend/models/Fee";
import { parseOptionalDate } from "@/backend/lib/http";
import { ServiceError, type SessionUser } from "@/backend/types";
import { accountingService } from "@/backend/services/accounting.service";
import { resolveStudent, resolveTeacher } from "@/backend/lib/portal";
import type { z } from "zod";
import { Types } from "mongoose";
import type {
  courseSchema,
  lectureSchema,
  enrollmentSchema,
  diplomaSchema,
} from "@/backend/validators/modules.validator";

type CourseInput = z.infer<typeof courseSchema>;
type LectureInput = z.infer<typeof lectureSchema>;
type EnrollmentInput = z.infer<typeof enrollmentSchema>;
type DiplomaInput = z.infer<typeof diplomaSchema>;

/** Post distance-learning fees to Accounting + optional Fee voucher. */
async function syncEnrollmentFinance(
  enrollment: {
    _id: { toString(): string };
    studentId: unknown;
    feePaid: number;
    status: string;
  },
  course: { code?: string; title?: string; fee?: number; branchCode?: string } | null
) {
  const id = String(enrollment._id);
  const paid = enrollment.feePaid || 0;
  const title = `Distance: ${course?.code || "COURSE"} — ${course?.title || "Enrollment"}`;

  if (paid <= 0) {
    await accountingService.removeBySource("elearning", id);
    return;
  }

  await accountingService.upsertLinked({
    type: "income",
    category: "Distance Learning",
    title,
    amount: paid,
    date: new Date(),
    method: "online",
    reference: `EL-${id.slice(-6).toUpperCase()}`,
    notes: "Auto-posted from distance enrollment",
    branchCode: course?.branchCode,
    sourceType: "elearning",
    sourceId: id,
  });

  /** Keep a student fee voucher in sync (linked by notes tag). */
  const existing = await Fee.findOne({ notes: `EL-${id}` });
  const courseFee = course?.fee ?? paid;
  const feePayload = {
    studentId: enrollment.studentId,
    title,
    amount: courseFee,
    dueDate: new Date(),
    status: (paid >= courseFee ? "paid" : paid > 0 ? "partial" : "pending") as
      | "paid"
      | "partial"
      | "pending",
    paidAmount: paid,
    paymentDate: paid > 0 ? new Date() : undefined,
    method: "online" as const,
    notes: `EL-${id}`,
    branchCode: course?.branchCode,
  };
  if (existing) {
    await Fee.findByIdAndUpdate(existing._id, feePayload);
    await accountingService.removeBySource("fee", String(existing._id));
  } else {
    const fee = await Fee.create(feePayload);
    /** Avoid double-counting: fee voucher exists for student view; ledger is elearning source. */
    await accountingService.removeBySource("fee", String(fee._id));
  }
}

export const elearningService = {
  async stats(scope?: { teacherId?: string; studentId?: string }) {
    await dbConnect();
    if (scope?.teacherId) {
      const courseIds = (
        await Course.find({ teacherId: scope.teacherId }).select("_id").lean()
      ).map((c) => c._id);
      const [courses, lectures, enrollments, diplomas, liveNow] = await Promise.all([
        Course.countDocuments({ teacherId: scope.teacherId }),
        Lecture.countDocuments({
          $or: [{ teacherId: scope.teacherId }, { courseId: { $in: courseIds } }],
        }),
        Enrollment.countDocuments({ courseId: { $in: courseIds }, status: "active" }),
        Diploma.countDocuments({ courseId: { $in: courseIds }, status: "issued" }),
        Lecture.countDocuments({
          type: "live",
          status: "live",
          $or: [{ teacherId: scope.teacherId }, { courseId: { $in: courseIds } }],
        }),
      ]);
      return { courses, lectures, enrollments, diplomas, liveNow };
    }
    if (scope?.studentId) {
      const enrollments = await Enrollment.find({
        studentId: scope.studentId,
        status: { $ne: "dropped" },
      })
        .select("courseId")
        .lean();
      const courseIds = enrollments.map((e) => e.courseId);
      const [lectures, diplomas, liveNow] = await Promise.all([
        Lecture.countDocuments({ courseId: { $in: courseIds } }),
        Diploma.countDocuments({ studentId: scope.studentId, status: "issued" }),
        Lecture.countDocuments({ courseId: { $in: courseIds }, type: "live", status: "live" }),
      ]);
      return {
        courses: courseIds.length,
        lectures,
        enrollments: enrollments.length,
        diplomas,
        liveNow,
      };
    }
    const [courses, lectures, enrollments, diplomas, liveNow] = await Promise.all([
      Course.countDocuments(),
      Lecture.countDocuments(),
      Enrollment.countDocuments({ status: "active" }),
      Diploma.countDocuments({ status: "issued" }),
      Lecture.countDocuments({ type: "live", status: "live" }),
    ]);
    return { courses, lectures, enrollments, diplomas, liveNow };
  },

  async scopeFor(session: SessionUser) {
    if (session.role === "teacher") {
      const teacher = await resolveTeacher(session);
      return { role: "teacher" as const, teacherId: teacher ? String(teacher._id) : null };
    }
    if (session.role === "student" || session.role === "parent") {
      const student = await resolveStudent(session);
      return { role: "student" as const, studentId: student ? String(student._id) : null };
    }
    return { role: "admin" as const };
  },

  // —— Courses ——
  async listCourses(scope?: { teacherId?: string; studentId?: string }) {
    await dbConnect();
    if (scope?.teacherId) {
      return Course.find({ teacherId: scope.teacherId })
        .populate("teacherId", "firstName lastName employeeId")
        .sort({ createdAt: -1 })
        .lean();
    }
    if (scope?.studentId) {
      const enrolled = await Enrollment.find({
        studentId: scope.studentId,
        status: { $ne: "dropped" },
      })
        .select("courseId")
        .lean();
      const ids = enrolled.map((e) => e.courseId);
      return Course.find({ _id: { $in: ids } })
        .populate("teacherId", "firstName lastName employeeId")
        .sort({ createdAt: -1 })
        .lean();
    }
    return Course.find()
      .populate("teacherId", "firstName lastName employeeId")
      .sort({ createdAt: -1 })
      .lean();
  },

  async createCourse(data: CourseInput) {
    await dbConnect();
    return Course.create({
      ...data,
      branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
      teacherId: data.teacherId || undefined,
      startDate: parseOptionalDate(data.startDate ?? undefined),
      endDate: parseOptionalDate(data.endDate ?? undefined),
    });
  },

  async updateCourse(id: string, data: CourseInput) {
    await dbConnect();
    const item = await Course.findByIdAndUpdate(
      id,
      {
        ...data,
        branchCode: data.branchCode ? data.branchCode.toUpperCase() : undefined,
        teacherId: data.teacherId || null,
        startDate: parseOptionalDate(data.startDate ?? undefined),
        endDate: parseOptionalDate(data.endDate ?? undefined),
      },
      { new: true }
    ).populate("teacherId", "firstName lastName employeeId");
    if (!item) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    return item;
  },

  async removeCourse(id: string) {
    await dbConnect();
    const item = await Course.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    await Lecture.deleteMany({ courseId: id });
    await Enrollment.deleteMany({ courseId: id });
    return { ok: true };
  },

  // —— Lectures ——
  async listLectures(
    courseId?: string | null,
    scope?: { teacherId?: string; studentId?: string }
  ) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (courseId) filter.courseId = courseId;
    if (scope?.teacherId) {
      const courseIds = (
        await Course.find({ teacherId: scope.teacherId }).select("_id").lean()
      ).map((c) => c._id);
      filter.$or = [{ teacherId: scope.teacherId }, { courseId: { $in: courseIds } }];
    }
    if (scope?.studentId) {
      const enrolled = await Enrollment.find({
        studentId: scope.studentId,
        status: { $ne: "dropped" },
      })
        .select("courseId")
        .lean();
      filter.courseId = { $in: enrolled.map((e) => e.courseId) };
    }
    return Lecture.find(filter)
      .populate("courseId", "code title")
      .populate("teacherId", "firstName lastName")
      .sort({ order: 1, scheduledAt: -1 })
      .lean();
  },

  async createLecture(data: LectureInput) {
    await dbConnect();
    return Lecture.create({
      ...data,
      teacherId: data.teacherId || undefined,
      scheduledAt: parseOptionalDate(data.scheduledAt ?? undefined),
    });
  },

  async updateLecture(id: string, data: LectureInput) {
    await dbConnect();
    const item = await Lecture.findByIdAndUpdate(
      id,
      {
        ...data,
        teacherId: data.teacherId || null,
        scheduledAt: parseOptionalDate(data.scheduledAt ?? undefined),
      },
      { new: true }
    )
      .populate("courseId", "code title")
      .populate("teacherId", "firstName lastName");
    if (!item) throw new ServiceError("NOT_FOUND", "Lecture not found", 404);
    return item;
  },

  async removeLecture(id: string) {
    await dbConnect();
    const item = await Lecture.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Lecture not found", 404);
    return { ok: true };
  },

  // —— Enrollments ——
  async listEnrollments(
    courseId?: string | null,
    scope?: { teacherId?: string; studentId?: string }
  ) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (courseId) filter.courseId = courseId;
    if (scope?.studentId) filter.studentId = scope.studentId;
    if (scope?.teacherId) {
      const courseIds = (
        await Course.find({ teacherId: scope.teacherId }).select("_id").lean()
      ).map((c) => c._id);
      filter.courseId = courseId || { $in: courseIds };
    }
    return Enrollment.find(filter)
      .populate("courseId", "code title fee level mode branchCode")
      .populate("studentId", "firstName lastName admissionNo")
      .sort({ enrolledAt: -1 })
      .lean();
  },

  async enroll(data: EnrollmentInput) {
    await dbConnect();
    const course = await Course.findById(data.courseId);
    if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    const count = await Enrollment.countDocuments({
      courseId: data.courseId,
      status: { $in: ["pending", "active"] },
    });
    if (count >= course.maxSeats) {
      throw new ServiceError("CONFLICT", "Course is full — no seats left", 409);
    }
    try {
      const enrollment = await Enrollment.create({
        ...data,
        enrolledAt: new Date(),
      });
      await syncEnrollmentFinance(enrollment, course);
      return enrollment;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("duplicate") || msg.includes("E11000")) {
        throw new ServiceError("CONFLICT", "Student already enrolled in this course", 409);
      }
      throw e;
    }
  },

  async updateEnrollment(id: string, data: EnrollmentInput) {
    await dbConnect();
    const item = await Enrollment.findByIdAndUpdate(id, data, { new: true })
      .populate("courseId", "code title fee level mode branchCode")
      .populate("studentId", "firstName lastName admissionNo");
    if (!item) throw new ServiceError("NOT_FOUND", "Enrollment not found", 404);
    const course =
      typeof item.courseId === "object" && item.courseId && "code" in item.courseId
        ? item.courseId
        : await Course.findById(data.courseId);
    await syncEnrollmentFinance(item, course as { code?: string; title?: string; fee?: number; branchCode?: string } | null);
    return item;
  },

  /** Student-safe progress update: only toggles a lecture on their own enrollment. */
  async markLectureComplete(
    enrollmentId: string,
    studentId: string,
    lectureId: string,
    completed: boolean
  ) {
    await dbConnect();
    const enrollment = await Enrollment.findOne({
      _id: enrollmentId,
      studentId,
      status: { $ne: "dropped" },
    });
    if (!enrollment) {
      throw new ServiceError("NOT_FOUND", "Enrollment not found", 404);
    }
    const lecture = await Lecture.findOne({
      _id: lectureId,
      courseId: enrollment.courseId,
      status: { $ne: "cancelled" },
      $or: [
        { type: "recorded", recordingUrl: { $nin: [null, ""] } },
        { type: "live", status: "completed" },
      ],
    }).select("_id");
    if (!lecture) {
      throw new ServiceError("NOT_FOUND", "Lecture is not part of this course", 404);
    }

    const lectureIds = new Set<string>(
      ((enrollment.completedLectureIds || []) as Types.ObjectId[]).map(
        (value: Types.ObjectId) => String(value)
      )
    );
    if (completed) lectureIds.add(String(lecture._id));
    else lectureIds.delete(String(lecture._id));

    const totalLectures = await Lecture.countDocuments({
      courseId: enrollment.courseId,
      status: { $ne: "cancelled" },
      $or: [
        { type: "recorded", recordingUrl: { $nin: [null, ""] } },
        { type: "live", status: "completed" },
      ],
    });
    const validCompleted = await Lecture.countDocuments({
      _id: { $in: [...lectureIds] },
      courseId: enrollment.courseId,
      status: { $ne: "cancelled" },
      $or: [
        { type: "recorded", recordingUrl: { $nin: [null, ""] } },
        { type: "live", status: "completed" },
      ],
    });
    const progress =
      totalLectures > 0 ? Math.round((validCompleted / totalLectures) * 100) : 0;

    enrollment.completedLectureIds = [...lectureIds].map((id) => new Types.ObjectId(id));
    enrollment.progress = progress;
    enrollment.status = progress === 100 ? "completed" : "active";
    await enrollment.save();
    return enrollment.populate("courseId", "code title fee level mode branchCode");
  },

  async removeEnrollment(id: string) {
    await dbConnect();
    const item = await Enrollment.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Enrollment not found", 404);
    await accountingService.removeBySource("elearning", id);
    await Fee.deleteMany({ notes: `EL-${id}` });
    return { ok: true };
  },

  // —— Diplomas ——
  async listDiplomas(scope?: { teacherId?: string; studentId?: string }) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (scope?.studentId) filter.studentId = scope.studentId;
    if (scope?.teacherId) {
      const courseIds = (
        await Course.find({ teacherId: scope.teacherId }).select("_id").lean()
      ).map((c) => c._id);
      filter.courseId = { $in: courseIds };
    }
    return Diploma.find(filter)
      .populate("studentId", "firstName lastName admissionNo")
      .populate("courseId", "code title level")
      .sort({ issueDate: -1 })
      .lean();
  },

  async issueDiploma(data: DiplomaInput) {
    await dbConnect();
    return Diploma.create({
      ...data,
      issueDate: parseOptionalDate(data.issueDate) ?? new Date(),
    });
  },

  async removeDiploma(id: string) {
    await dbConnect();
    const item = await Diploma.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Diploma not found", 404);
    return { ok: true };
  },
};
