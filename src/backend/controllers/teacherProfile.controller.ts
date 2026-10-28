/**
 * Teacher profile: bio-data, photo, classes, payslips with salary tax, leaves and the
 * yearly tax certificate. `id` may be "me" for the signed-in teacher.
 */
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/backend/config/database";
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { photoUrl } from "@/backend/lib/images";
import { resolveTeacher } from "@/backend/lib/portal";
import { LeaveRequest, Payslip } from "@/backend/models/HR";
import { Student } from "@/backend/models/Student";
import { Teacher } from "@/backend/models/Teacher";
import { salaryTaxService, taxYearLabel, taxYearOf } from "@/backend/services/salaryTax.service";
import type { SessionUser } from "@/backend/types";

type Ctx = { params: Promise<{ id: string }> };

/** The teacher id this session may see, or an error response. */
async function allowedTeacherId(rawId: string, session: SessionUser) {
  if (session.role === "teacher") {
    const me = await resolveTeacher(session);
    if (!me) return { error: jsonError("Your login is not linked to a teacher profile yet", 404) };
    if (rawId !== "me" && rawId !== String(me._id)) return { error: jsonError("Forbidden", 403) };
    return { id: String(me._id) };
  }
  if (rawId === "me") return { error: jsonError("Only teachers have a “my profile”", 400) };
  if (!isValidObjectId(rawId)) return { error: jsonError("Invalid teacher ID", 400) };
  return { id: rawId };
}

/** Fields a teacher may correct on their own profile. */
const selfEditSchema = z.object({
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(80).optional(),
  emergencyName: z.string().trim().max(120).optional(),
  emergencyPhone: z.string().trim().max(40).optional(),
  bloodGroup: z.string().trim().max(10).optional(),
  maritalStatus: z.enum(["single", "married", "other"]).optional(),
});

const taxConfigSchema = z.object({
  preset: z.string().optional(),
  yearStartMonth: z.coerce.number().int().min(1).max(12).optional(),
  slabs: z.array(z.object({ from: z.coerce.number().min(0), rate: z.coerce.number().min(0).max(100) })).min(1).optional(),
  standardDeduction: z.coerce.number().min(0).optional(),
  rebateUpTo: z.coerce.number().min(0).optional(),
  cessPercent: z.coerce.number().min(0).max(100).optional(),
  medicalExemptPercent: z.coerce.number().min(0).max(100).optional(),
  certificateTitle: z.string().trim().max(200).optional(),
  employerTaxNumber: z.string().trim().max(60).optional(),
});

export const teacherProfileController = {
  async get(_: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const allowed = await allowedTeacherId((await ctx.params).id, session!);
      if (allowed.error) return allowed.error;
      await dbConnect();
      const teacher = await Teacher.findById(allowed.id)
        .populate("subjects", "name code")
        .populate("classes", "name section room")
        .lean();
      if (!teacher) return jsonError("Teacher not found", 404);
      const classIds = (teacher.classes || []).map((c: { _id: unknown }) => c._id);
      const [payslips, leaves, counts, cfg] = await Promise.all([
        Payslip.find({ teacherId: teacher._id }).sort({ month: -1 }).lean(),
        LeaveRequest.find({ teacherId: teacher._id }).sort({ createdAt: -1 }).limit(20).lean(),
        Student.aggregate([
          { $match: { classId: { $in: classIds }, status: "active" } },
          { $group: { _id: "$classId", n: { $sum: 1 } } },
        ]),
        salaryTaxService.config(),
      ]);
      const now = new Date();
      const thisYear = taxYearOf(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, cfg);
      const years = Array.from(new Set([thisYear, ...payslips.map((p) => taxYearOf(p.month, cfg))])).sort((a, b) => b - a);
      // Summary for the latest tax year that has salary (falls back to the current year).
      const shownYear = payslips.length ? Math.max(...payslips.map((p) => taxYearOf(p.month, cfg))) : thisYear;
      const ytd = payslips.filter((p) => taxYearOf(p.month, cfg) === shownYear);
      return jsonOk({
        teacher: { ...teacher, photoUrl: photoUrl("teacher", teacher._id, teacher.photoUpdatedAt) },
        classes: (teacher.classes || []).map((c: { _id: unknown; name: string; section?: string; room?: string }) => ({
          ...c,
          students: counts.find((x) => String(x._id) === String(c._id))?.n || 0,
        })),
        payslips,
        leaves,
        tax: {
          yearLabel: taxYearLabel(shownYear, cfg),
          shownYear,
          yearStartMonth: cfg.yearStartMonth,
          years: years.map((y) => ({ startYear: y, label: taxYearLabel(y, cfg) })),
          gross: ytd.reduce((t, p) => t + p.basic + p.allowances, 0),
          taxable: ytd.reduce((t, p) => t + (p.taxableIncome || 0), 0),
          tax: ytd.reduce((t, p) => t + (p.incomeTax || 0), 0),
          net: ytd.reduce((t, p) => t + p.net, 0),
        },
        canEdit: session!.role === "admin",
        isSelf: session!.role === "teacher",
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** A teacher corrects their own contact details (admins use the full teacher form). */
  async updateSelf(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["teacher"]);
    if (error) return error;
    try {
      const allowed = await allowedTeacherId((await ctx.params).id, session!);
      if (allowed.error) return allowed.error;
      const parsed = selfEditSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      await dbConnect();
      await Teacher.updateOne({ _id: allowed.id }, { $set: parsed.data });
      return jsonOk({ ok: true });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async taxCertificate(req: Request, ctx: Ctx) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const allowed = await allowedTeacherId((await ctx.params).id, session!);
      if (allowed.error) return allowed.error;
      const year = Number(new URL(req.url).searchParams.get("year")) || undefined;
      return jsonOk(await salaryTaxService.certificate(allowed.id!, year));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async taxConfig() {
    const { error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      return jsonOk({ config: await salaryTaxService.config(), presets: salaryTaxService.presets() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveTaxConfig(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = taxConfigSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk({ config: await salaryTaxService.saveConfig(parsed.data) });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
