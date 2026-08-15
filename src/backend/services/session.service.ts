/**
 * Academic year / session — create, activate, close, reopen.
 * Active session name is mirrored onto Settings.academicYear.
 */
import { Types } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { AcademicSession } from "@/backend/models/AcademicSession";
import { ClassModel } from "@/backend/models/Class";
import { Settings } from "@/backend/models/Settings";
import { ServiceError } from "@/backend/types";
import { parseOptionalDate } from "@/backend/lib/http";
import type { z } from "zod";
import type {
  academicSessionSchema,
  sessionActionSchema,
} from "@/backend/validators/modules.validator";

type SessionInput = z.infer<typeof academicSessionSchema>;
type SessionAction = z.infer<typeof sessionActionSchema>;

function toCode(name: string, explicit?: string) {
  const raw = (explicit || name).trim().toUpperCase();
  return raw.replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "SESSION";
}

async function findSession(ref: string) {
  const clean = ref.trim();
  if (!clean) return null;
  if (Types.ObjectId.isValid(clean) && String(new Types.ObjectId(clean)) === clean) {
    const byId = await AcademicSession.findById(clean).lean();
    if (byId) return byId;
  }
  return AcademicSession.findOne({
    $or: [{ name: clean }, { code: clean.toUpperCase() }],
  }).lean();
}

async function syncSettingsYear(name: string) {
  await Settings.findOneAndUpdate(
    {},
    { $set: { academicYear: name } },
    { upsert: true, setDefaultsOnInsert: true }
  );
}

async function copyClasses(fromYear: string, toYear: string) {
  if (fromYear === toYear) return 0;
  const source = await ClassModel.find({ academicYear: fromYear }).lean();
  if (!source.length) return 0;
  const ops = source.map((cls) => ({
    updateOne: {
      filter: { name: cls.name, section: cls.section, academicYear: toYear },
      update: {
        $setOnInsert: {
          name: cls.name,
          section: cls.section,
          academicYear: toYear,
          room: cls.room,
          capacity: cls.capacity,
          branchCode: cls.branchCode,
          stage: cls.stage,
          stream: cls.stream,
          level: cls.level,
          subjects: cls.subjects || [],
          // Fresh year — no class teacher carried over by default.
        },
      },
      upsert: true,
    },
  }));
  const result = await ClassModel.bulkWrite(ops, { ordered: false });
  return result.upsertedCount;
}

/** Seed one active session from settings / existing classes if the collection is empty. */
async function ensureSeeded() {
  await dbConnect();
  const count = await AcademicSession.estimatedDocumentCount();
  if (count > 0) return;
  const settings = await Settings.findOne().lean();
  const sampleClass = await ClassModel.findOne().sort({ createdAt: 1 }).lean();
  const name =
    sampleClass?.academicYear ||
    settings?.academicYear ||
    `${new Date().getFullYear()}–${String(new Date().getFullYear() + 1).slice(-2)}`;
  await AcademicSession.create({
    name,
    code: toCode(name),
    status: "active",
    activatedAt: new Date(),
    startDate: new Date(`${new Date().getFullYear()}-04-01`),
  });
  await syncSettingsYear(name);
}

export const sessionService = {
  async list() {
    await ensureSeeded();
    const sessions = await AcademicSession.find().sort({ startDate: -1, createdAt: -1 }).lean();
    const years = sessions.map((s) => s.name);
    const classCounts = years.length
      ? await ClassModel.aggregate([
          { $match: { academicYear: { $in: years } } },
          { $group: { _id: "$academicYear", count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(classCounts.map((c) => [c._id, c.count]));
    return sessions.map((s) => ({
      ...s,
      classCount: countMap.get(s.name) ?? 0,
    }));
  },

  async active() {
    await ensureSeeded();
    return AcademicSession.findOne({ status: "active" }).lean();
  },

  async create(data: SessionInput) {
    await ensureSeeded();
    const name = data.name.trim();
    const code = toCode(name, data.code);
    const clash = await AcademicSession.findOne({ $or: [{ name }, { code }] }).lean();
    if (clash) {
      throw new ServiceError("CONFLICT", "A session with this name or code already exists", 409);
    }

    let copiedFrom;
    let classesCopied = 0;
    const copyFrom = data.copyClassesFrom?.trim();
    if (copyFrom) {
      const source = await findSession(copyFrom);
      if (!source) throw new ServiceError("NOT_FOUND", "Source session for class copy not found", 404);
      copiedFrom = source._id;
      classesCopied = await copyClasses(source.name, name);
    }

    const session = await AcademicSession.create({
      name,
      code,
      startDate: parseOptionalDate(data.startDate),
      endDate: parseOptionalDate(data.endDate),
      notes: data.notes,
      status: "draft",
      copiedFrom,
    });

    if (data.activate) {
      return { ...(await this.activate(String(session._id), {})), classesCopied };
    }

    return { session: session.toObject(), classesCopied };
  },

  async activate(id: string, opts: { copyClassesFrom?: string | null } = {}) {
    await ensureSeeded();
    const session = await AcademicSession.findById(id);
    if (!session) throw new ServiceError("NOT_FOUND", "Session not found", 404);
    if (session.status === "closed") {
      throw new ServiceError(
        "VALIDATION",
        "Closed sessions cannot be activated. Reopen as draft first.",
        400
      );
    }

    let classesCopied = 0;
    const copyFrom = opts.copyClassesFrom?.trim();
    if (copyFrom) {
      const source = await findSession(copyFrom);
      if (!source) throw new ServiceError("NOT_FOUND", "Source session for class copy not found", 404);
      classesCopied = await copyClasses(source.name, session.name);
      session.copiedFrom = source._id;
    }

    await AcademicSession.updateMany(
      { status: "active", _id: { $ne: session._id } },
      { $set: { status: "closed", closedAt: new Date() } }
    );

    session.status = "active";
    session.activatedAt = new Date();
    session.closedAt = undefined;
    await session.save();
    await syncSettingsYear(session.name);

    return { session: session.toObject(), classesCopied };
  },

  async close(id: string) {
    await ensureSeeded();
    const session = await AcademicSession.findById(id);
    if (!session) throw new ServiceError("NOT_FOUND", "Session not found", 404);
    if (session.status === "closed") {
      throw new ServiceError("VALIDATION", "Session is already closed", 400);
    }
    if (session.status === "active") {
      throw new ServiceError(
        "VALIDATION",
        "Activate the next session instead — that closes this year automatically",
        400
      );
    }

    session.status = "closed";
    session.closedAt = new Date();
    await session.save();
    return { session: session.toObject() };
  },

  /** Closed → draft so it can be activated again later. */
  async reopen(id: string) {
    await ensureSeeded();
    const session = await AcademicSession.findById(id);
    if (!session) throw new ServiceError("NOT_FOUND", "Session not found", 404);
    if (session.status !== "closed") {
      throw new ServiceError("VALIDATION", "Only closed sessions can be reopened", 400);
    }
    session.status = "draft";
    session.closedAt = undefined;
    await session.save();
    return { session: session.toObject() };
  },

  async remove(id: string) {
    await ensureSeeded();
    const session = await AcademicSession.findById(id);
    if (!session) throw new ServiceError("NOT_FOUND", "Session not found", 404);
    if (session.status === "active") {
      throw new ServiceError("VALIDATION", "Close or switch away from the active session first", 400);
    }
    const classes = await ClassModel.countDocuments({ academicYear: session.name });
    if (classes > 0) {
      throw new ServiceError(
        "CONFLICT",
        `${classes} class section(s) still use this session. Remove or move them first.`,
        409
      );
    }
    await session.deleteOne();
    return { ok: true };
  },

  async applyAction(id: string, data: SessionAction) {
    if (data.action === "activate") {
      return this.activate(id, { copyClassesFrom: data.copyClassesFrom });
    }
    if (data.action === "close") return this.close(id);
    return this.reopen(id);
  },
};
