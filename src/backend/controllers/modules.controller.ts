import {
  firstZodError,
  fromServiceError,
  jsonError,
  jsonOk,
  requireAuth,
} from "@/backend/lib/http";
import { settingsService } from "@/backend/services/settings.service";
import { sessionService } from "@/backend/services/session.service";
import { accountingService } from "@/backend/services/accounting.service";
import { inventoryService } from "@/backend/services/inventory.service";
import { hrService } from "@/backend/services/hr.service";
import { noticeService } from "@/backend/services/notice.service";
import { reportsService } from "@/backend/services/reports.service";
import { elearningService } from "@/backend/services/elearning.service";
import { siteService } from "@/backend/services/site.service";
import {
  settingsSchema,
  ledgerSchema,
  inventorySchema,
  stockVoucherSchema,
  leaveSchema,
  payslipSchema,
  noticeSchema,
  courseSchema,
  lectureSchema,
  enrollmentSchema,
  diplomaSchema,
  quizSchema,
  quizAttemptSchema,
  siteContentSchema,
  admissionSchema,
  admissionStatusSchema,
  optionListSchema,
  accountSchema,
  voucherSchema,
  voucherActionSchema,
  academicSessionSchema,
  sessionActionSchema,
} from "@/backend/validators/modules.validator";

type Ctx = { params: Promise<{ id: string }> };

export const settingsController = {
  async get() {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk({ settings: await settingsService.get() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = settingsSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ settings: await settingsService.update(parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async addOption(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = optionListSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const value = await settingsService.addOption(parsed.data.key, parsed.data.value);
      return jsonOk({ value }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const sessionController = {
  async list() {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk({
        sessions: await sessionService.list(),
        active: await sessionService.active(),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = academicSessionSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await sessionService.create(parsed.data), 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const parsed = sessionActionSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await sessionService.applyAction(id, parsed.data));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await sessionService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const accountingController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      const view = url.searchParams.get("view");
      const type = url.searchParams.get("type");
      const status = url.searchParams.get("status");
      const branchCode = url.searchParams.get("branch");
      const range = {
        branchCode,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      };
      if (view === "accounts") {
        return jsonOk({ accounts: await accountingService.accounts() });
      }
      if (view === "vouchers") {
        return jsonOk({
          vouchers: await accountingService.vouchers({ type, status, branchCode }),
        });
      }
      if (view === "next-voucher-number") {
        const voucherType = url.searchParams.get("type") || "journal";
        const date = url.searchParams.get("date") || new Date().toISOString();
        return jsonOk({
          number: await accountingService.nextVoucherNumberPreview(
            voucherType,
            branchCode || "MAIN",
            date
          ),
        });
      }
      if (view === "audit-log") {
        const voucherId = url.searchParams.get("voucherId");
        if (!voucherId) return jsonError("Select a voucher to view its audit history");
        return jsonOk({ events: await accountingService.auditTrail(voucherId) });
      }
      if (view === "trial-balance") {
        return jsonOk(await accountingService.trialBalance(range));
      }
      if (view === "statements") {
        return jsonOk(await accountingService.statements(range));
      }
      if (view === "profit-loss") {
        return jsonOk(await accountingService.profitAndLoss(range));
      }
      if (view === "balance-sheet") {
        return jsonOk(await accountingService.balanceSheet(range));
      }
      if (view === "day-book") {
        return jsonOk(await accountingService.dayBook(range));
      }
      if (view === "general-ledger") {
        const accountCode = url.searchParams.get("account");
        if (!accountCode) return jsonError("Select an account to view its ledger");
        return jsonOk(await accountingService.generalLedger({ ...range, accountCode }));
      }
      const [entries, summary] = await Promise.all([
        accountingService.list(type, branchCode),
        accountingService.summary(branchCode),
      ]);
      return jsonOk({ entries, summary });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async create(req: Request) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      if (body.kind === "seed") {
        return jsonOk(await accountingService.seedAccounts(), 201);
      }
      if (body.kind === "account") {
        const parsed = accountSchema.safeParse(body.account);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ account: await accountingService.createAccount(parsed.data) }, 201);
      }
      if (body.kind === "voucher") {
        const parsed = voucherSchema.safeParse(body.voucher);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(
          { voucher: await accountingService.createVoucher(parsed.data, session!) },
          201
        );
      }
      if (body.kind === "reconcile") {
        return jsonOk({
          entry: await accountingService.setReconciled(body.id, Boolean(body.reconciled)),
        });
      }
      if (body.kind === "wht") {
        return jsonOk({ entry: await accountingService.applyWht(body.id) });
      }
      const parsed = ledgerSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const entry = await accountingService.create(parsed.data, session!.id);
      return jsonOk({ entry }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      if (body.kind === "account") {
        return jsonOk({
          account: await accountingService.setAccountActive(id, Boolean(body.isActive)),
        });
      }
      if (body.kind === "voucher_update") {
        const parsed = voucherSchema.safeParse(body.voucher);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({
          voucher: await accountingService.updateVoucherDraft(id, parsed.data, session!),
        });
      }
      const parsed = voucherActionSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      switch (parsed.data.action) {
        case "post":
          return jsonOk({ voucher: await accountingService.postVoucher(id, session!) });
        case "void":
          return jsonOk({
            voucher: await accountingService.voidVoucher(
              id,
              parsed.data.reason || "",
              session!
            ),
          });
        case "approve":
          return jsonOk({
            voucher: await accountingService.approveVoucher(id, session!),
          });
        case "reject":
          return jsonOk({
            voucher: await accountingService.rejectVoucher(
              id,
              parsed.data.reason || "Rejected",
              session!
            ),
          });
        case "cancel":
          return jsonOk({
            voucher: await accountingService.cancelVoucher(
              id,
              parsed.data.reason || "Cancelled",
              session!
            ),
          });
        case "reverse":
          return jsonOk({
            voucher: await accountingService.reverseVoucher(
              id,
              parsed.data.reason || "Reversed",
              session!
            ),
          });
        default:
          return jsonError("Unsupported action");
      }
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async remove(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if (new URL(req.url).searchParams.get("kind") === "voucher") {
        const body = await req.json().catch(() => ({}));
        return jsonOk(await accountingService.removeVoucher(id, body.reason || "", session!));
      }
      return jsonOk(await accountingService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const inventoryController = {
  async list(req: Request) {
    const { error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const params = new URL(req.url).searchParams;
      const branchCode = params.get("branch");
      if (params.get("view") === "audit-log") {
        const voucherId = params.get("voucherId");
        if (!voucherId) return jsonError("Select a voucher to view its audit history");
        return jsonOk({ events: await inventoryService.auditTrail(voucherId) });
      }
      const [items, stats, vouchers] = await Promise.all([
        inventoryService.list(branchCode),
        inventoryService.stats(branchCode),
        inventoryService.vouchers({
          branchCode,
          type: params.get("type"),
          status: params.get("status"),
        }),
      ]);
      return jsonOk({ items, stats, vouchers });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async create(req: Request) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const body = await req.json();
      if (body.kind === "voucher") {
        const parsed = stockVoucherSchema.safeParse(body.voucher);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(
          { voucher: await inventoryService.createVoucher(parsed.data, session!) },
          201
        );
      }
      const parsed = inventorySchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ item: await inventoryService.create(parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      if (body.kind === "voucher") {
        const parsed = voucherActionSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        if (parsed.data.action === "post") {
          return jsonOk({ voucher: await inventoryService.postVoucher(id, session!) });
        }
        return jsonOk({
          voucher: await inventoryService.voidVoucher(
            id,
            parsed.data.reason || "",
            session!
          ),
        });
      }
      const parsed = inventorySchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ item: await inventoryService.update(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async remove(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      if (new URL(req.url).searchParams.get("kind") === "voucher") {
        const body = await req.json().catch(() => ({}));
        return jsonOk(await inventoryService.removeVoucher(id, body.reason || "", session!));
      }
      return jsonOk(await inventoryService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const hrController = {
  async overview() {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      if (session!.role === "teacher") {
        const { resolveTeacher } = await import("@/backend/lib/portal");
        const teacher = await resolveTeacher(session!);
        if (!teacher) {
          return jsonOk({ leaves: [], payslips: [], payroll: null, portal: "teacher", linked: false });
        }
        const tid = String(teacher._id);
        const [leaves, payslips] = await Promise.all([
          hrService.listLeavesForTeacher(tid),
          hrService.listPayslipsForTeacher(tid),
        ]);
        return jsonOk({ leaves, payslips, payroll: null, portal: "teacher", linked: true });
      }
      const [leaves, payslips, payroll] = await Promise.all([
        hrService.listLeaves(),
        hrService.listPayslips(),
        hrService.payrollSummary(),
      ]);
      return jsonOk({ leaves, payslips, payroll, portal: "admin" });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async createLeave(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = leaveSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const data = { ...parsed.data };
      if (session!.role === "teacher") {
        const { resolveTeacher } = await import("@/backend/lib/portal");
        const teacher = await resolveTeacher(session!);
        if (!teacher) return jsonError("Teacher profile not linked", 400);
        data.teacherId = String(teacher._id);
      }
      return jsonOk({ leave: await hrService.createLeave(data, session) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async updateLeave(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const status = body.status as "pending" | "approved" | "rejected";
      return jsonOk({
        leave: await hrService.updateLeaveStatus(id, status, session!.id),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async removeLeave(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await hrService.removeLeave(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async createPayslip(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = payslipSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ payslip: await hrService.createPayslip(parsed.data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async updatePayslip(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = payslipSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ payslip: await hrService.updatePayslip(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async removePayslip(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await hrService.removePayslip(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const noticeController = {
  async list() {
    const { error } = await requireAuth();
    if (error) return error;
    try {
      return jsonOk({ notices: await noticeService.list() });
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async create(req: Request) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = noticeSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ notice: await noticeService.create(parsed.data, session!.id) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },
  async remove(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await noticeService.remove(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

export const reportsController = {
  async run(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher", "student", "parent"]);
    if (error) return error;
    try {
      const params = new URL(req.url).searchParams;
      const type = params.get("type") || "overview";
      if (
        (session!.role === "student" || session!.role === "parent") &&
        type !== "transcript" &&
        type !== "result-cards"
      ) {
        return jsonError("Parents and students can open transcripts and result cards only", 403);
      }
      switch (type) {
        case "result-cards": {
          const classId = params.get("classId") || "all";
          return jsonOk({
            report: "result-cards",
            data: await reportsService.resultCardsBatch({
              classId,
              examType: params.get("examType"),
              branchCode: params.get("branch"),
            }),
          });
        }
        case "transcript": {
          let studentId = params.get("studentId");
          if (session!.role === "student" || session!.role === "parent") {
            const { resolveStudent } = await import("@/backend/lib/portal");
            const student = await resolveStudent(session!);
            if (!student) return jsonError("No linked student profile", 400);
            studentId = String(student._id);
          }
          if (!studentId) return jsonError("studentId is required", 400);
          return jsonOk({
            report: "transcript",
            data: await reportsService.transcript(studentId),
          });
        }
        case "students":
          return jsonOk({ report: "students", rows: await reportsService.studentsByClass() });
        case "fees":
          return jsonOk({ report: "fees", rows: await reportsService.feeDefaulters() });
        case "attendance":
          return jsonOk({ report: "attendance", rows: await reportsService.attendanceSummary() });
        case "exams":
          return jsonOk({ report: "exams", rows: await reportsService.examOverview() });
        case "staff":
          return jsonOk({ report: "staff", rows: await reportsService.staffDirectory() });
        case "classes":
          return jsonOk({ report: "classes", rows: await reportsService.classStrength() });
        case "finance":
          return jsonOk({ report: "finance", data: await reportsService.financeSnapshot() });
        case "inventory":
          return jsonOk({ report: "inventory", rows: await reportsService.inventoryReport() });
        default:
          return jsonOk({
            report: "overview",
            data: {
              classes: await reportsService.classStrength(),
              finance: await reportsService.financeSnapshot(),
              attendance: await reportsService.attendanceSummary(),
            },
          });
      }
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

type EKind = "course" | "lecture" | "enrollment" | "diploma" | "quiz" | "quiz-attempt";

function eKind(req: Request): EKind {
  const k = new URL(req.url).searchParams.get("kind") || "course";
  if (
    k === "lecture" ||
    k === "enrollment" ||
    k === "diploma" ||
    k === "quiz" ||
    k === "quiz-attempt"
  )
    return k;
  return "course";
}

/** Distance learning — one controller, ?kind=course|lecture|enrollment|diploma|quiz */
export const elearningController = {
  async list(req: Request) {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      const kind = eKind(req);
      const courseId = new URL(req.url).searchParams.get("courseId");
      const quizId = new URL(req.url).searchParams.get("quizId");
      const portal = await elearningService.scopeFor(session!);
      const scope =
        portal.role === "teacher" && portal.teacherId
          ? { teacherId: portal.teacherId }
          : portal.role === "student" && portal.studentId
            ? { studentId: portal.studentId }
            : undefined;
      if (portal.role === "teacher" && !portal.teacherId) {
        return jsonOk({
          kind,
          stats: await elearningService.stats(scope),
          courses: [],
          lectures: [],
          enrollments: [],
          diplomas: [],
          quizzes: [],
          portal,
        });
      }
      if (portal.role === "student" && !portal.studentId) {
        return jsonOk({
          kind,
          stats: await elearningService.stats(scope),
          courses: [],
          lectures: [],
          enrollments: [],
          diplomas: [],
          quizzes: [],
          portal,
        });
      }
      const stats = await elearningService.stats(scope);
      if (kind === "lecture") {
        return jsonOk({
          kind,
          stats,
          portal,
          lectures: await elearningService.listLectures(courseId, scope),
        });
      }
      if (kind === "enrollment") {
        return jsonOk({
          kind,
          stats,
          portal,
          enrollments: await elearningService.listEnrollments(courseId, scope),
        });
      }
      if (kind === "diploma") {
        return jsonOk({
          kind,
          stats,
          portal,
          diplomas: await elearningService.listDiplomas(scope),
        });
      }
      if (kind === "quiz") {
        return jsonOk({
          kind,
          stats,
          portal,
          quizzes: await elearningService.listQuizzes(courseId, scope),
        });
      }
      if (kind === "quiz-attempt") {
        return jsonOk({
          kind,
          stats,
          portal,
          attempts: await elearningService.listAttempts(quizId, scope),
        });
      }
      return jsonOk({
        kind,
        stats,
        portal,
        courses: await elearningService.listCourses(scope),
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async create(req: Request) {
    const { session, error } = await requireAuth(["admin", "teacher", "student", "parent"]);
    if (error) return error;
    try {
      const kind = eKind(req);
      const body = await req.json();
      const portal = await elearningService.scopeFor(session!);
      if (kind === "quiz-attempt") {
        const parsed = quizAttemptSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk(
          { attempt: await elearningService.submitQuiz(parsed.data, session!) },
          201
        );
      }
      if (session!.role === "student" || session!.role === "parent") {
        return jsonError("Students can only submit quiz attempts", 403);
      }
      if (kind === "lecture") {
        const parsed = lectureSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        const data = { ...parsed.data };
        if (portal.role === "teacher" && portal.teacherId) {
          data.teacherId = data.teacherId || portal.teacherId;
        }
        return jsonOk({ lecture: await elearningService.createLecture(data) }, 201);
      }
      if (kind === "enrollment") {
        if (session!.role === "teacher") {
          return jsonError("Teachers cannot enroll students — ask an admin", 403);
        }
        const parsed = enrollmentSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ enrollment: await elearningService.enroll(parsed.data) }, 201);
      }
      if (kind === "diploma") {
        if (session!.role !== "admin") {
          return jsonError("Only admins can issue diplomas", 403);
        }
        const parsed = diplomaSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ diploma: await elearningService.issueDiploma(parsed.data) }, 201);
      }
      if (kind === "quiz") {
        const parsed = quizSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ quiz: await elearningService.createQuiz(parsed.data) }, 201);
      }
      if (body.kind === "project-library") {
        if (session!.role !== "admin") {
          return jsonError("Only admins can import the project course library", 403);
        }
        return jsonOk(await elearningService.seedProjectLibrary(), 201);
      }
      const parsed = courseSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const data = { ...parsed.data };
      if (portal.role === "teacher" && portal.teacherId) {
        data.teacherId = portal.teacherId;
      }
      return jsonOk({ course: await elearningService.createCourse(data) }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async update(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher", "student", "parent"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const kind = eKind(req);
      const body = await req.json();
      if (session!.role === "student" || session!.role === "parent") {
        if (
          kind !== "enrollment" ||
          body.action !== "markLecture" ||
          typeof body.lectureId !== "string" ||
          typeof body.completed !== "boolean"
        ) {
          return jsonError("Students can only update their own lecture progress", 403);
        }
        const portal = await elearningService.scopeFor(session!);
        if (portal.role !== "student" || !portal.studentId) {
          return jsonError("Student portal is not linked to an admission", 403);
        }
        return jsonOk({
          enrollment: await elearningService.markLectureComplete(
            id,
            portal.studentId,
            body.lectureId,
            body.completed
          ),
        });
      }
      if (kind === "lecture") {
        const parsed = lectureSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ lecture: await elearningService.updateLecture(id, parsed.data) });
      }
      if (kind === "enrollment") {
        if (session!.role === "teacher") {
          return jsonError("Teachers cannot edit enrollments", 403);
        }
        const parsed = enrollmentSchema.safeParse(body);
        if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
        return jsonOk({ enrollment: await elearningService.updateEnrollment(id, parsed.data) });
      }
      if (kind === "diploma") {
        return jsonError("Diplomas cannot be edited — revoke by deleting", 400);
      }
      const parsed = courseSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ course: await elearningService.updateCourse(id, parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async remove(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "teacher"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const kind = eKind(req);
      if (session!.role === "teacher" && kind !== "lecture") {
        return jsonError("Teachers can only delete their own lectures", 403);
      }
      if (kind === "lecture") return jsonOk(await elearningService.removeLecture(id));
      if (kind === "enrollment") return jsonOk(await elearningService.removeEnrollment(id));
      if (kind === "diploma") return jsonOk(await elearningService.removeDiploma(id));
      if (kind === "quiz") return jsonOk(await elearningService.removeQuiz(id));
      return jsonOk(await elearningService.removeCourse(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};

/** Public website + CMS. GET is public; writes require admin. */
export const siteController = {
  async publicData() {
    try {
      return jsonOk(await siteService.publicData());
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async updateContent(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json();
      const parsed = siteContentSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ content: await siteService.updateContent(parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** Public application form submit. */
  async apply(req: Request) {
    try {
      const body = await req.json();
      const parsed = admissionSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      await siteService.apply(parsed.data);
      return jsonOk({ ok: true, message: "Application received" }, 201);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async listAdmissions(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const url = new URL(req.url);
      return jsonOk(
        await siteService.listAdmissions(
          url.searchParams.get("status"),
          url.searchParams.get("branch")
        )
      );
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async updateAdmission(req: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = admissionStatusSchema.safeParse(body);
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ application: await siteService.setAdmissionStatus(id, parsed.data.status) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeAdmission(_: Request, ctx: Ctx) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const { id } = await ctx.params;
      return jsonOk(await siteService.removeAdmission(id));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
