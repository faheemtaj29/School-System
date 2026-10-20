/**
 * Timetable / period schedule service.
 * One timetable per class per academic year.
 */
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { Timetable, type ITimetableSlot, type Weekday } from "@/backend/models/Timetable";
import { ClassModel } from "@/backend/models/Class";
import { Subject } from "@/backend/models/Subject";
import { Teacher } from "@/backend/models/Teacher";
import { ServiceError } from "@/backend/types";

type SlotInput = Omit<ITimetableSlot, "_id">;

export type TimetableView = {
  _id: string;
  classId: string;
  className: string;
  section: string;
  academicYear: string;
  days: Weekday[];
  periodsPerDay: number;
  publishedAt?: string;
  slots: {
    _id: string;
    day: Weekday;
    period: number;
    startTime?: string;
    endTime?: string;
    subjectId?: string;
    subjectName?: string;
    teacherId?: string;
    teacherName?: string;
    room?: string;
    label?: string;
    isBreak?: boolean;
  }[];
};

export type ConflictWarning = { day: Weekday; period: number; teacherName: string; conflictClass: string };

export const timetableService = {
  async list(academicYear: string, branchCode?: string): Promise<TimetableView[]> {
    await dbConnect();
    const q: Record<string, unknown> = { academicYear };
    if (branchCode) q.branchCode = branchCode;
    const docs = await Timetable.find(q)
      .populate("classId", "name section")
      .populate("slots.subject", "name")
      .populate("slots.teacher", "firstName lastName")
      .lean();
    return docs.map(toView);
  },

  async getByClass(classId: string, academicYear: string): Promise<TimetableView | null> {
    await dbConnect();
    const doc = await Timetable.findOne({ classId, academicYear })
      .populate("classId", "name section")
      .populate("slots.subject", "name")
      .populate("slots.teacher", "firstName lastName")
      .lean();
    return doc ? toView(doc) : null;
  },

  async upsert(classId: string, academicYear: string, data: { days?: Weekday[]; periodsPerDay?: number; branchCode?: string }): Promise<TimetableView> {
    await dbConnect();
    const cls = await ClassModel.findById(classId).lean();
    if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);
    const tt = await Timetable.findOneAndUpdate(
      { classId, academicYear },
      { $setOnInsert: { classId, academicYear, slots: [] }, $set: { ...(data.days ? { days: data.days } : {}), ...(data.periodsPerDay ? { periodsPerDay: data.periodsPerDay } : {}), ...(data.branchCode ? { branchCode: data.branchCode } : {}) } },
      { upsert: true, new: true }
    )
      .populate("classId", "name section")
      .populate("slots.subject", "name")
      .populate("slots.teacher", "firstName lastName");
    return toView(tt.toObject());
  },

  async setSlot(classId: string, academicYear: string, slot: SlotInput): Promise<{ timetable: TimetableView; conflicts: ConflictWarning[] }> {
    await dbConnect();
    let tt = await Timetable.findOne({ classId, academicYear });
    if (!tt) {
      const cls = await ClassModel.findById(classId).lean();
      if (!cls) throw new ServiceError("NOT_FOUND", "Class not found", 404);
      tt = await Timetable.create({ classId, academicYear, slots: [] });
    }
    // Remove existing slot at same day+period then add new
    tt.slots = tt.slots.filter((s: ITimetableSlot) => !(s.day === slot.day && s.period === slot.period)) as typeof tt.slots;
    if (!slot.isBreak || slot.label) {
      tt.slots.push(slot as ITimetableSlot);
    }
    await tt.save();

    // Check teacher conflicts across other classes
    const conflicts: ConflictWarning[] = [];
    if (slot.teacher && !slot.isBreak) {
      const others = await Timetable.find({ classId: { $ne: classId }, academicYear })
        .populate("classId", "name section")
        .lean();
      for (const other of others) {
        const clash = other.slots.find((s: ITimetableSlot) => s.day === slot.day && s.period === slot.period && s.teacher?.toString() === slot.teacher?.toString());
        if (clash) {
          const teacher = await Teacher.findById(slot.teacher).select("firstName lastName").lean<{ firstName: string; lastName: string }>();
          const cls = other.classId as unknown as { name: string; section: string };
          conflicts.push({ day: slot.day, period: slot.period, teacherName: teacher ? `${teacher.firstName} ${teacher.lastName}` : "Teacher", conflictClass: `${cls.name} ${cls.section}` });
        }
      }
    }

    const populated = await Timetable.findById(tt._id)
      .populate("classId", "name section")
      .populate("slots.subject", "name")
      .populate("slots.teacher", "firstName lastName")
      .lean();
    return { timetable: toView(populated!), conflicts };
  },

  async clearSlot(classId: string, academicYear: string, day: Weekday, period: number): Promise<void> {
    await dbConnect();
    await Timetable.updateOne({ classId, academicYear }, { $pull: { slots: { day, period } } });
  },

  async publish(classId: string, academicYear: string): Promise<void> {
    await dbConnect();
    await Timetable.updateOne({ classId, academicYear }, { $set: { publishedAt: new Date() } });
  },

  /** Teacher's weekly view: all slots assigned to this teacher. */
  async teacherView(teacherId: string, academicYear: string): Promise<TimetableView[]> {
    await dbConnect();
    const docs = await Timetable.find({ academicYear, "slots.teacher": new Types.ObjectId(teacherId) })
      .populate("classId", "name section")
      .populate("slots.subject", "name")
      .populate("slots.teacher", "firstName lastName")
      .lean();
    // Return only the matching teacher's slots
    return docs.map((d) => toView({ ...d, slots: d.slots.filter((s: ITimetableSlot) => s.teacher?.toString() === teacherId) }));
  },

  async listClasses(academicYear: string): Promise<{ _id: string; name: string; section: string; hasTimetable: boolean }[]> {
    await dbConnect();
    const [classes, tts] = await Promise.all([
      ClassModel.find({ academicYear }).sort({ level: 1, name: 1, section: 1 }).select("name section").lean<{ _id: Types.ObjectId; name: string; section: string }[]>(),
      Timetable.find({ academicYear }).select("classId").lean<{ classId: Types.ObjectId }[]>(),
    ]);
    const hasSet = new Set(tts.map((t) => t.classId.toString()));
    return classes.map((c) => ({ _id: String(c._id), name: c.name, section: c.section, hasTimetable: hasSet.has(String(c._id)) }));
  },

  async subjectsAndTeachers() {
    await dbConnect();
    const [subjects, teachers] = await Promise.all([
      Subject.find({}).sort({ name: 1 }).select("name code").lean<{ _id: Types.ObjectId; name: string; code: string }[]>(),
      Teacher.find({ status: "active" }).sort({ firstName: 1 }).select("firstName lastName").lean<{ _id: Types.ObjectId; firstName: string; lastName: string }[]>(),
    ]);
    return {
      subjects: subjects.map((s) => ({ _id: String(s._id), name: s.name, code: s.code })),
      teachers: teachers.map((t) => ({ _id: String(t._id), name: `${t.firstName} ${t.lastName}` })),
    };
  },
};

function toView(doc: Record<string, unknown>): TimetableView {
  const cls = doc.classId as { _id?: unknown; name?: string; section?: string } | null;
  return {
    _id: String((doc._id as Types.ObjectId) || ""),
    classId: cls ? String(cls._id || doc.classId) : String(doc.classId),
    className: cls?.name || "",
    section: cls?.section || "",
    academicYear: doc.academicYear as string,
    days: (doc.days as Weekday[]) || ["Mon", "Tue", "Wed", "Thu", "Fri"],
    periodsPerDay: (doc.periodsPerDay as number) || 8,
    publishedAt: doc.publishedAt ? new Date(doc.publishedAt as string | Date).toISOString() : undefined,
    slots: ((doc.slots as Record<string, unknown>[]) || []).map((s) => {
      const subj = s.subject as { _id?: unknown; name?: string } | null;
      const tchr = s.teacher as { _id?: unknown; firstName?: string; lastName?: string } | null;
      return {
        _id: String(s._id || ""),
        day: s.day as Weekday,
        period: s.period as number,
        startTime: s.startTime as string | undefined,
        endTime: s.endTime as string | undefined,
        subjectId: subj ? String(subj._id || s.subject) : undefined,
        subjectName: subj?.name || undefined,
        teacherId: tchr ? String(tchr._id || s.teacher) : undefined,
        teacherName: tchr ? `${tchr.firstName || ""} ${tchr.lastName || ""}`.trim() : undefined,
        room: s.room as string | undefined,
        label: s.label as string | undefined,
        isBreak: s.isBreak as boolean | undefined,
      };
    }),
  };
}
