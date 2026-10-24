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
import { platformService } from "@/backend/services/platform.service";

type SiteInput = z.infer<typeof siteContentSchema>;
type AdmissionInput = z.infer<typeof admissionSchema>;

const fallbackSiteContent = {
  brandName: "Sabaq",
  tagline: "Learning that grows with every child",
  heroTitle: "A smarter, kinder school experience",
  heroSubtitle:
    "From academic excellence to admissions and campus operations, every detail works together to support growth.",
  heroCtaLabel: "Apply now",
  admissionsTitle: "Ready to begin your journey?",
  admissionsBody:
    "Start with admissions, choose your program, and let our team guide the next step for your family.",
  aboutTitle: "Built for confident futures",
  aboutBody:
    "Sabaq brings academics, student services, and campus operations into one connected school ecosystem.",
  address: "",
  phone: "",
  email: "",
  facebook: "",
  showCourses: true,
  stats: [
    { title: "12K+", text: "Students supported" },
    { title: "85%", text: "Academic satisfaction" },
    { title: "24/7", text: "Parent visibility" },
  ],
  features: [
    { title: "Personalized learning", text: "Programs and support shaped around every learner." },
    { title: "Connected operations", text: "Admissions, classes, records, and finance stay in sync." },
    { title: "Modern campus life", text: "Technology that makes daily school life smoother." },
  ],
};

function normalizeCnic(value?: string) {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 13) return value.trim();
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export const siteService = {
  async content() {
    try {
      await dbConnect();
      let doc = await SiteContent.findOne().lean();
      if (!doc) {
        const created = await SiteContent.create({});
        doc = created.toObject();
      }
      return doc;
    } catch {
      return fallbackSiteContent;
    }
  },

  /** Everything the public website renders: content, branches, open courses. */
  async publicData() {
    const content = await this.content();

    try {
      await dbConnect();
      const [settingsResult, coursesResult, activeSessionResult] = await Promise.allSettled([
        Settings.findOne().lean(),
        Course.find({ status: { $in: ["open", "ongoing"] } })
          .select("code title description mode level fee durationWeeks branchCode startDate")
          .sort({ createdAt: -1 })
          .limit(24)
          .lean(),
        AcademicSession.findOne({ status: "active" }).lean(),
      ]);

      const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
      const courses = coursesResult.status === "fulfilled" ? coursesResult.value : [];
      const activeSession = activeSessionResult.status === "fulfilled" ? activeSessionResult.value : null;

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
        branches: settings?.branches?.length ? settings.branches : [{ code: "MAIN", name: "Main Campus" }],
        currency: settings?.currency || "PKR",
        academicYear,
        classOptions,
        courses: content.showCourses ? courses : [],
      };
    } catch {
      return {
        content,
        branches: [{ code: "MAIN", name: "Main Campus" }],
        currency: "PKR",
        academicYear: "",
        classOptions: [],
        courses: [],
      };
    }
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
    const stats = {
      new: 0,
      contacted: 0,
      test: 0,
      merit: 0,
      waiting: 0,
      offered: 0,
      enrolled: 0,
      rejected: 0,
    };
    for (const c of counts) {
      if (c._id in stats) stats[c._id as keyof typeof stats] = c.count;
    }
    return { applications, stats };
  },

  async apply(data: AdmissionInput) {
    await dbConnect();
    const item = await Admission.create({
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
    try {
      await platformService.seedDefaults();
      await platformService.startWorkflow(
        {
          workflowCode: "ADMISSION",
          subjectType: "admission",
          subjectId: String(item._id),
          title: `Admission · ${item.applicantName}`,
          payload: {
            classApplied: item.classApplied,
            phone: item.phone,
            branchCode: item.branchCode,
          },
        },
        { id: "public", name: "Public admissions", role: "admin" }
      );
    } catch {
      /* application saved even if workflow not seeded */
    }
    return item;
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
