/**
 * Public website content + admission applications.
 */
import { dbConnect } from "@/backend/config/database";
import { SiteContent, Admission } from "@/backend/models/Site";
import { Course } from "@/backend/models/ELearning";
import { ClassModel } from "@/backend/models/Class";
import { Settings } from "@/backend/models/Settings";
import { AcademicSession } from "@/backend/models/AcademicSession";
import { ServiceError } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type {
  siteContentSchema,
  admissionSchema,
} from "@/backend/validators/modules.validator";

type SiteInput = z.infer<typeof siteContentSchema>;
type AdmissionInput = z.infer<typeof admissionSchema>;

function normalizeCnic(value?: string) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 13) return value.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export const siteService = {
  async content() {
    await dbConnect();
    let doc = await SiteContent.findOne().lean();
    if (!doc) {
      const created = await SiteContent.create({});
      doc = created.toObject();
    }
    return doc;
  },

  /** Everything the public website renders: content, branches, open courses. */
  async publicData() {
    await dbConnect();
    const [content, settings, courses, activeSession] = await Promise.all([
      this.content(),
      Settings.findOne().lean(),
      Course.find({ status: { $in: ["open", "ongoing"] } })
        .select("code title description mode level fee durationWeeks branchCode startDate")
        .sort({ createdAt: -1 })
        .limit(24)
        .lean(),
      AcademicSession.findOne({ status: "active" }).lean(),
    ]);
    const academicYear = activeSession?.name || settings?.academicYear || "";
    const classes = academicYear
      ? await ClassModel.find({ academicYear })
          .select("name section stage stream level")
          .sort({ level: 1, name: 1, section: 1 })
          .lean()
      : await ClassModel.find()
          .select("name section stage stream level academicYear")
          .sort({ level: 1, name: 1 })
          .limit(80)
          .lean();

    /** Unique class labels for the admission dropdown (one per grade/programme). */
    const classOptions = [
      ...new Map(
        classes.map((c) => {
          const label = c.stream ? `${c.name} (${c.stream})` : c.name;
          return [label, { name: c.name, label, stage: c.stage, stream: c.stream }];
        })
      ).values(),
    ];

    return {
      content,
      branches: settings?.branches?.length
        ? settings.branches
        : [{ code: "MAIN", name: "Main Campus" }],
      currency: settings?.currency || "PKR",
      academicYear,
      classOptions,
      courses: content.showCourses ? courses : [],
    };
  },

  async updateContent(data: SiteInput) {
    await dbConnect();
    return SiteContent.findOneAndUpdate({}, data, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    });
  },

  async listAdmissions(status?: string | null, branchCode?: string | null) {
    await dbConnect();
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (branchCode) filter.branchCode = branchCode.toUpperCase();
    const [applications, counts] = await Promise.all([
      Admission.find(filter).populate("courseId", "code title").sort({ createdAt: -1 }).lean(),
      Admission.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    const stats = { new: 0, contacted: 0, enrolled: 0, rejected: 0 };
    for (const c of counts) {
      if (c._id in stats) stats[c._id as keyof typeof stats] = c.count;
    }
    return { applications, stats };
  },

  async apply(data: AdmissionInput) {
    await dbConnect();
    return Admission.create({
      ...data,
      dateOfBirth: parseOptionalDate(data.dateOfBirth),
      studentCnic: normalizeCnic(data.studentCnic),
      guardianCnic: normalizeCnic(data.guardianCnic),
      motherCnic: normalizeCnic(data.motherCnic),
      email: data.email || undefined,
      guardianEmail: data.guardianEmail || undefined,
      courseId: data.courseId || undefined,
      branchCode: data.branchCode.toUpperCase(),
      academicYear: data.academicYear || undefined,
    });
  },

  async setAdmissionStatus(id: string, status: string) {
    await dbConnect();
    const item = await Admission.findByIdAndUpdate(id, { status }, { new: true });
    if (!item) throw new ServiceError("NOT_FOUND", "Application not found", 404);
    return item;
  },

  async removeAdmission(id: string) {
    await dbConnect();
    const item = await Admission.findByIdAndDelete(id);
    if (!item) throw new ServiceError("NOT_FOUND", "Application not found", 404);
    return { ok: true };
  },
};
