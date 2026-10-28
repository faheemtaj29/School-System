/**
 * Student documents printed on the campus letterhead: ID cards (a class or picked students) and
 * certificates — admission form, school leaving, character, studying and fee clearance.
 */
import { dbConnect } from "@/backend/config/database";
import { ClassModel } from "@/backend/models/Class";
import { Fee } from "@/backend/models/Fee";
import { Settings } from "@/backend/models/Settings";
import { Student } from "@/backend/models/Student";
import { letterheads } from "@/backend/lib/letterhead";
import { photoUrl } from "@/backend/lib/images";
import { sessionService } from "@/backend/services/session.service";
import { ServiceError } from "@/backend/types";

export const CERTIFICATES = {
  admission: "Admission Form",
  leaving: "School Leaving Certificate",
  character: "Character Certificate",
  studying: "Studying Certificate",
  clearance: "Fee Clearance Certificate",
} as const;

export type CertificateType = keyof typeof CERTIFICATES;

type ClassLean = { _id: unknown; name: string; section: string; academicYear?: string; classTeacher?: { firstName?: string; lastName?: string } };

const classLabel = (c?: ClassLean | null) => (c ? `${c.name} - ${c.section}` : "");
const iso = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);

/** Unpaid balance of a student's fee challans. */
async function duesOf(studentIds: unknown[]) {
  const rows = await Fee.aggregate([
    { $match: { studentId: { $in: studentIds }, status: { $in: ["pending", "partial", "overdue"] } } },
    {
      $group: {
        _id: "$studentId",
        due: { $sum: { $subtract: [{ $subtract: ["$amount", { $ifNull: ["$discountAmount", 0] }] }, { $ifNull: ["$paidAmount", 0] }] } },
        months: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { due: Math.max(0, Math.round(r.due)), months: r.months as number }]));
}

export const studentDocsService = {
  /** ID cards for whole classes and/or picked students (active students only). */
  async idCards(opts: { classIds?: string[]; ids?: string[] }) {
    await dbConnect();
    const or: Record<string, unknown>[] = [];
    if (opts.classIds?.length) or.push({ classId: { $in: opts.classIds } });
    if (opts.ids?.length) or.push({ _id: { $in: opts.ids } });
    if (!or.length) throw new ServiceError("VALIDATION", "Pick a class or students", 400);
    const [students, head, session, settings] = await Promise.all([
      Student.find({ $or: or, status: "active" })
        .select("firstName lastName admissionNo rollNumber parentName parentPhone address dateOfBirth classId branchCode photoUpdatedAt gender")
        .populate("classId", "name section academicYear level")
        .lean(),
      letterheads(),
      sessionService.active(),
      Settings.findOne().select("principalName").lean(),
    ]);
    students.sort((a, b) => {
      const ca = a.classId as unknown as ClassLean & { level?: number };
      const cb = b.classId as unknown as ClassLean & { level?: number };
      return (
        (ca?.level || 0) - (cb?.level || 0) ||
        classLabel(ca).localeCompare(classLabel(cb)) ||
        (Number(a.rollNumber) || 9999) - (Number(b.rollNumber) || 9999) ||
        a.firstName.localeCompare(b.firstName)
      );
    });
    return {
      principalName: settings?.principalName || "",
      session: session?.name || "",
      validTill: iso(session?.endDate),
      cards: students.map((s) => ({
        _id: String(s._id),
        name: `${s.firstName} ${s.lastName || ""}`.trim(),
        fatherName: s.parentName || "",
        classLabel: classLabel(s.classId as unknown as ClassLean),
        rollNumber: s.rollNumber || "",
        admissionNo: s.admissionNo,
        dateOfBirth: iso(s.dateOfBirth),
        phone: s.parentPhone || "",
        address: s.address || "",
        photoUrl: photoUrl("student", s._id, s.photoUpdatedAt),
        head: head(s.branchCode || (s.classId as unknown as { branchCode?: string })?.branchCode),
      })),
    };
  },

  /** Everything a certificate needs for one student. */
  async certificate(id: string, type: CertificateType) {
    await dbConnect();
    if (!(type in CERTIFICATES)) throw new ServiceError("VALIDATION", "Unknown certificate", 400);
    const s = await Student.findById(id)
      .populate({ path: "classId", select: "name section academicYear classTeacher branchCode", populate: { path: "classTeacher", select: "firstName lastName" } })
      .lean();
    if (!s) throw new ServiceError("NOT_FOUND", "Student not found", 404);
    if (type === "leaving" && !s.tcNo) {
      throw new ServiceError("VALIDATION", "Issue the leaving certificate first: Students → More → Documents & ID card", 400);
    }
    const cls = s.classId as unknown as ClassLean & { branchCode?: string };
    const [heads, dues, settings, session, firstClass] = await Promise.all([
      letterheads(),
      duesOf([s._id]),
      Settings.findOne().select("principalName").lean(),
      sessionService.active(),
      ClassModel.findById(cls?._id).select("_id").lean(),
    ]);
    const due = dues.get(String(s._id)) || { due: 0, months: 0 };
    const today = new Date();
    const stamp = today.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = { admission: "ADM", leaving: "SLC", character: "CC", studying: "SC", clearance: "FC" }[type];
    return {
      type,
      title: CERTIFICATES[type],
      head: heads(s.branchCode || cls?.branchCode),
      principalName: settings?.principalName || "",
      session: session?.name || cls?.academicYear || "",
      refNo: type === "leaving" ? s.tcNo : `${prefix}-${s.admissionNo}-${stamp}`,
      issueDate: iso(type === "leaving" ? s.tcIssuedDate : today),
      dues: { amount: due.due, months: due.months },
      student: {
        _id: String(s._id),
        name: `${s.firstName} ${s.lastName || ""}`.trim(),
        gender: s.gender || "",
        fatherName: s.parentName || "",
        admissionNo: s.admissionNo,
        rollNumber: s.rollNumber || "",
        classLabel: classLabel(cls),
        classExists: Boolean(firstClass),
        classTeacher: cls?.classTeacher ? `${cls.classTeacher.firstName || ""} ${cls.classTeacher.lastName || ""}`.trim() : "",
        dateOfBirth: iso(s.dateOfBirth),
        admissionDate: iso(s.admissionDate),
        cnic: s.cnic || "",
        nationality: s.nationality || "Pakistani",
        religion: s.religion || "",
        address: s.address || "",
        phone: s.phone || "",
        email: s.email || "",
        parentPhone: s.parentPhone || "",
        parentEmail: s.parentEmail || "",
        previousSchool: s.previousSchool || "",
        status: s.status,
        leavingDate: iso(s.leavingDate),
        leavingReason: s.leavingReason || "",
        conduct: s.conductRemark || "Good",
        photoUrl: photoUrl("student", s._id, s.photoUpdatedAt),
      },
    };
  },
};
