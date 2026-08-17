/**
 * Distance learning business logic (courses, lectures, enrollments, diplomas).
 */
import { dbConnect } from "@/backend/config/database";
import { Course, Lecture, Enrollment, Diploma, Quiz, QuizAttempt } from "@/backend/models/ELearning";
import { Fee } from "@/backend/models/Fee";
import { Settings } from "@/backend/models/Settings";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
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
  quizSchema,
  quizAttemptSchema,
} from "@/backend/validators/modules.validator";

type CourseInput = z.infer<typeof courseSchema>;
type LectureInput = z.infer<typeof lectureSchema>;
type EnrollmentInput = z.infer<typeof enrollmentSchema>;
type DiplomaInput = z.infer<typeof diplomaSchema>;
type QuizInput = z.infer<typeof quizSchema>;
type QuizAttemptInput = z.infer<typeof quizAttemptSchema>;

function normalizeBranch(code?: string | null) {
  const clean = code?.trim();
  return clean ? clean.toUpperCase() : undefined;
}

async function resolveScopedBranch(input: {
  branchCode?: string | null;
  fallbackBranchCode?: string | null;
  teacherId?: string | null;
}) {
  const settings = await Settings.findOne().select("branches defaultBranchCode").lean();
  const allowed = new Set(
    (settings?.branches || []).map((branch) => normalizeBranch(branch.code)).filter(Boolean) || ["MAIN"]
  );
  const teacherBranch = input.teacherId
    ? normalizeBranch((await Teacher.findById(input.teacherId).select("branchCode").lean())?.branchCode)
    : undefined;
  const resolved =
    normalizeBranch(input.branchCode) ||
    teacherBranch ||
    normalizeBranch(input.fallbackBranchCode) ||
    normalizeBranch(settings?.defaultBranchCode) ||
    "MAIN";
  if (!allowed.has(resolved)) {
    throw new ServiceError("VALIDATION", `Unknown branch code '${resolved}'`, 400);
  }
  if (teacherBranch && resolved !== teacherBranch) {
    throw new ServiceError("VALIDATION", "Course branch must match teacher branch", 400);
  }
  return resolved;
}

async function resolveCourseBranch(courseId: string) {
  const settings = await Settings.findOne().select("branches defaultBranchCode").lean();
  const allowed = new Set(
    (settings?.branches || []).map((branch) => normalizeBranch(branch.code)).filter(Boolean) || ["MAIN"]
  );
  const course = await Course.findById(courseId).select("branchCode").lean();
  if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
  const branchCode = normalizeBranch(course.branchCode) || normalizeBranch(settings?.defaultBranchCode) || "MAIN";
  if (!allowed.has(branchCode)) {
    throw new ServiceError("VALIDATION", `Unknown branch code '${branchCode}'`, 400);
  }
  return branchCode;
}

async function resolveStudentBranch(studentId: string) {
  const student = await Student.findById(studentId).select("branchCode").lean();
  if (!student) throw new ServiceError("NOT_FOUND", "Student not found", 404);
  return normalizeBranch(student.branchCode);
}

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
  async assertTeacherOwnsCourse(courseId: string, teacherId: string) {
    await dbConnect();
    const course = await Course.findById(courseId).select("teacherId").lean();
    if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    if (!course.teacherId || String(course.teacherId) !== teacherId) {
      throw new ServiceError("FORBIDDEN", "You can only manage your own courses", 403);
    }
  },

  async assertTeacherOwnsLecture(lectureId: string, teacherId: string) {
    await dbConnect();
    const lecture = await Lecture.findById(lectureId).select("teacherId courseId").lean();
    if (!lecture) throw new ServiceError("NOT_FOUND", "Lecture not found", 404);
    if (lecture.teacherId && String(lecture.teacherId) === teacherId) return;
    const course = await Course.findById(lecture.courseId).select("teacherId").lean();
    if (!course?.teacherId || String(course.teacherId) !== teacherId) {
      throw new ServiceError("FORBIDDEN", "You can only manage your own lectures", 403);
    }
  },

  async assertTeacherOwnsQuiz(quizId: string, teacherId: string) {
    await dbConnect();
    const quiz = await Quiz.findById(quizId).select("courseId").lean();
    if (!quiz) throw new ServiceError("NOT_FOUND", "Quiz not found", 404);
    await this.assertTeacherOwnsCourse(String(quiz.courseId), teacherId);
  },

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
    const branchCode = await resolveScopedBranch({ branchCode: data.branchCode, teacherId: data.teacherId });
    return Course.create({
      ...data,
      branchCode,
      teacherId: data.teacherId || undefined,
      startDate: parseOptionalDate(data.startDate ?? undefined),
      endDate: parseOptionalDate(data.endDate ?? undefined),
      outline: data.outline || [],
    });
  },

  async updateCourse(id: string, data: CourseInput) {
    await dbConnect();
    const existing = await Course.findById(id).select("branchCode teacherId").lean();
    if (!existing) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    const branchCode = await resolveScopedBranch({
      branchCode: data.branchCode,
      fallbackBranchCode: existing.branchCode,
      teacherId: data.teacherId || (existing.teacherId ? String(existing.teacherId) : undefined),
    });
    const item = await Course.findByIdAndUpdate(
      id,
      {
        ...data,
        branchCode,
        teacherId: data.teacherId || null,
        startDate: parseOptionalDate(data.startDate ?? undefined),
        endDate: parseOptionalDate(data.endDate ?? undefined),
        outline: data.outline || [],
      },
      { new: true }
    ).populate("teacherId", "firstName lastName employeeId");
    return item;
  },

  /** Upsert research-backed project / maker course library with weekly outlines. */
  async seedProjectLibrary() {
    await dbConnect();
    const { PROJECT_COURSE_TEMPLATES } = await import("@/backend/data/courseOutlines");
    let created = 0;
    let updated = 0;
    for (const template of PROJECT_COURSE_TEMPLATES) {
      const existing = await Course.findOne({ code: template.code });
      if (existing) {
        await Course.findByIdAndUpdate(existing._id, {
          title: template.title,
          description: template.description,
          mode: template.mode,
          level: template.level,
          durationWeeks: template.durationWeeks,
          fee: template.fee,
          maxSeats: template.maxSeats,
          outline: template.outline,
          status: existing.status === "draft" ? "open" : existing.status,
        });
        updated += 1;
      } else {
        await Course.create({
          ...template,
          status: "open",
        });
        created += 1;
      }
    }
    return { created, updated, total: PROJECT_COURSE_TEMPLATES.length };
  },

  async removeCourse(id: string) {
    await dbConnect();
    const item = await Course.findById(id).select("branchCode").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    await resolveCourseBranch(id);
    await Course.findByIdAndDelete(id);
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
    const course = await Course.findById(data.courseId).select("branchCode teacherId").lean();
    if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    const courseBranch = normalizeBranch(course.branchCode);
    const teacherBranch = data.teacherId
      ? normalizeBranch((await Teacher.findById(data.teacherId).select("branchCode").lean())?.branchCode)
      : undefined;
    if (courseBranch && teacherBranch && courseBranch !== teacherBranch) {
      throw new ServiceError("VALIDATION", "Lecture teacher branch must match course branch", 400);
    }
    return Lecture.create({
      ...data,
      teacherId: data.teacherId || undefined,
      scheduledAt: parseOptionalDate(data.scheduledAt ?? undefined),
    });
  },

  async updateLecture(id: string, data: LectureInput) {
    await dbConnect();
    const existing = await Lecture.findById(id).select("courseId teacherId").lean();
    if (!existing) throw new ServiceError("NOT_FOUND", "Lecture not found", 404);
    const course = await Course.findById(existing.courseId).select("branchCode teacherId").lean();
    if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    const courseBranch = normalizeBranch(course.branchCode);
    const teacherBranch = data.teacherId
      ? normalizeBranch((await Teacher.findById(data.teacherId).select("branchCode").lean())?.branchCode)
      : existing.teacherId
        ? normalizeBranch((await Teacher.findById(existing.teacherId).select("branchCode").lean())?.branchCode)
        : undefined;
    if (courseBranch && teacherBranch && courseBranch !== teacherBranch) {
      throw new ServiceError("VALIDATION", "Lecture teacher branch must match course branch", 400);
    }
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
    const item = await Lecture.findById(id).select("courseId").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Lecture not found", 404);
    await resolveCourseBranch(String(item.courseId));
    await Lecture.findByIdAndDelete(id);
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
    const course = await Course.findById(data.courseId).select("maxSeats branchCode").lean();
    if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    const courseBranch = await resolveCourseBranch(data.courseId);
    const studentBranch = await resolveStudentBranch(data.studentId);
    if (studentBranch && studentBranch !== courseBranch) {
      throw new ServiceError("VALIDATION", "Student branch must match course branch", 400);
    }
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
    const courseBranch = await resolveCourseBranch(data.courseId);
    const studentBranch = await resolveStudentBranch(data.studentId);
    if (studentBranch && studentBranch !== courseBranch) {
      throw new ServiceError("VALIDATION", "Student branch must match course branch", 400);
    }
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
    const item = await Enrollment.findById(id).select("courseId").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Enrollment not found", 404);
    await resolveCourseBranch(String(item.courseId));
    await Enrollment.findByIdAndDelete(id);
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
    const courseBranch = await resolveCourseBranch(data.courseId);
    const studentBranch = await resolveStudentBranch(data.studentId);
    if (studentBranch && studentBranch !== courseBranch) {
      throw new ServiceError("VALIDATION", "Student branch must match course branch", 400);
    }
    return Diploma.create({
      ...data,
      issueDate: parseOptionalDate(data.issueDate) ?? new Date(),
    });
  },

  async removeDiploma(id: string) {
    await dbConnect();
    const item = await Diploma.findById(id).select("courseId").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Diploma not found", 404);
    await resolveCourseBranch(String(item.courseId));
    await Diploma.findByIdAndDelete(id);
    return { ok: true };
  },

  async listQuizzes(courseId?: string | null, scope?: { teacherId?: string; studentId?: string }) {
    await dbConnect();
    const filter: Record<string, unknown> = { active: true };
    if (courseId) filter.courseId = courseId;
    if (scope?.teacherId) {
      const courseIds = (
        await Course.find({ teacherId: scope.teacherId }).select("_id").lean()
      ).map((c) => c._id);
      filter.courseId = courseId ? courseId : { $in: courseIds };
    }
    if (scope?.studentId) {
      const enrolled = (
        await Enrollment.find({ studentId: scope.studentId, status: { $in: ["active", "completed"] } })
          .select("courseId")
          .lean()
      ).map((e) => e.courseId);
      filter.courseId = courseId ? courseId : { $in: enrolled };
    }
    return Quiz.find(filter)
      .populate("courseId", "code title")
      .sort({ updatedAt: -1 })
      .lean();
  },

  async createQuiz(data: QuizInput) {
    await dbConnect();
    const course = await Course.findById(data.courseId).select("branchCode teacherId").lean();
    if (!course) throw new ServiceError("NOT_FOUND", "Course not found", 404);
    return Quiz.create(data);
  },

  async removeQuiz(id: string) {
    await dbConnect();
    const item = await Quiz.findById(id).select("courseId").lean();
    if (!item) throw new ServiceError("NOT_FOUND", "Quiz not found", 404);
    await resolveCourseBranch(String(item.courseId));
    await Quiz.findByIdAndDelete(id);
    await QuizAttempt.deleteMany({ quizId: id });
    return { ok: true };
  },

  async submitQuiz(data: QuizAttemptInput, session: SessionUser) {
    await dbConnect();
    const quiz = await Quiz.findById(data.quizId).lean();
    if (!quiz) throw new ServiceError("NOT_FOUND", "Quiz not found", 404);

    let studentId = data.studentId;
    if (session.role === "student" || session.role === "parent") {
      const student = await resolveStudent(session);
      if (!student) throw new ServiceError("VALIDATION", "Student profile not linked", 400);
      studentId = String(student._id);
    }
    if (!studentId) throw new ServiceError("VALIDATION", "studentId is required", 400);

    let score = 0;
    quiz.questions.forEach((q, i) => {
      if (Number(data.answers[i]) === q.correctIndex) score += 1;
    });
    const total = quiz.questions.length || 1;
    const percent = Math.round((score / total) * 100);
    const passed = percent >= (quiz.passPercent || 50);

    return QuizAttempt.create({
      quizId: data.quizId,
      studentId,
      answers: data.answers,
      score,
      percent,
      passed,
      submittedAt: new Date(),
    });
  },

  async listAttempts(quizId?: string | null, scope?: { studentId?: string }) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (quizId) filter.quizId = quizId;
    if (scope?.studentId) filter.studentId = scope.studentId;
    return QuizAttempt.find(filter)
      .populate("studentId", "firstName lastName admissionNo")
      .populate("quizId", "title passPercent")
      .sort({ submittedAt: -1 })
      .lean();
  },
};
