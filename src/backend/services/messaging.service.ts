/**
 * Parent messages: build the list (absentees, fee dues, results, or a custom note), fill in
 * the wording from templates, and send through the gateway — or hand each one to WhatsApp.
 */
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/backend/config/database";
import { Attendance } from "@/backend/models/Attendance";
import { ClassModel } from "@/backend/models/Class";
import { Fee } from "@/backend/models/Fee";
import { MessageLog, type MessageKind } from "@/backend/models/Messaging";
import { Settings, type MessagingConfig } from "@/backend/models/Settings";
import { Student } from "@/backend/models/Student";
import { examCenterService } from "@/backend/services/examCenter.service";
import { ServiceError, type SessionUser } from "@/backend/types";

export const DEFAULT_TEMPLATES: MessagingConfig["templates"] = {
  absence:
    "Dear {parent}, {student} ({class}) was absent from school on {date}. Please contact the school if this was not expected. — {school}",
  fee: "Dear {parent}, fee of {currency} {amount} for {student} ({class}) is {status} (due {dueDate}). Please pay at the school office or bank. — {school}",
  result:
    "Dear {parent}, the {term} result of {student} ({class}) is ready: {obtained}/{total} marks, {percent}%, grade {grade}, {result}{position}. — {school}",
};

const DEFAULTS: MessagingConfig = {
  provider: "none",
  channel: "whatsapp",
  countryCode: "92",
  httpMethod: "GET",
  templates: DEFAULT_TEMPLATES,
};

export type PrepareInput = {
  kind: MessageKind;
  date?: string;
  classIds?: string[];
  feeScope?: "unpaid" | "overdue" | "due_soon";
  dueWithinDays?: number;
  termId?: string;
  text?: string;
};

export type MessageRow = {
  studentId: string;
  student: string;
  parent: string;
  className: string;
  phone: string;
  text: string;
  /** Opens WhatsApp with the message filled in. */
  waLink: string | null;
};

/** 0300-1234567 → 923001234567; keeps numbers that already carry a country code. */
export function normalizePhone(raw: string | undefined | null, countryCode: string) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = countryCode + d.slice(1);
  else if (d.length <= 10) d = countryCode + d;
  return d.length >= 10 ? d : "";
}

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function prettyDay(d: Date | string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

async function loadConfig() {
  await dbConnect();
  const s = await Settings.findOne().select("+messaging schoolName currency").lean();
  // Until saved, the country code follows the school's currency (₹ → 91, PKR → 92).
  const cur = String(s?.currency || "").toUpperCase();
  const countryCode = cur.includes("INR") || cur.includes("₹") ? "91" : "92";
  const cfg = { ...DEFAULTS, countryCode, ...(s?.messaging || {}) } as MessagingConfig;
  cfg.templates = { ...DEFAULT_TEMPLATES, ...(s?.messaging?.templates || {}) };
  return { cfg, school: s?.schoolName || "School", currency: s?.currency || "PKR" };
}

function classLabel(c?: { name?: string; section?: string } | null) {
  return c ? `${c.name || ""}${c.section ? `-${c.section}` : ""}` : "";
}

export const messagingService = {
  /** Settings for the screen — secrets are never sent back, only whether they are set. */
  async publicConfig() {
    const { cfg } = await loadConfig();
    const { twilioToken, httpUrl, ...rest } = cfg;
    return {
      ...rest,
      hasTwilioToken: Boolean(twilioToken),
      // The gateway link usually carries an API key; show only where it points.
      httpUrlHost: httpUrl ? (() => { try { return new URL(httpUrl.replace(/\{\w+\}/g, "x")).host; } catch { return "set"; } })() : "",
      defaults: DEFAULT_TEMPLATES,
    };
  },

  async saveConfig(input: Partial<Omit<MessagingConfig, "templates">> & { templates?: Partial<MessagingConfig["templates"]> }) {
    const { cfg } = await loadConfig();
    const next: MessagingConfig = {
      ...cfg,
      ...input,
      // Blank secret fields mean "keep the saved one".
      twilioToken: input.twilioToken ? input.twilioToken : cfg.twilioToken,
      httpUrl: input.httpUrl ? input.httpUrl : cfg.httpUrl,
      templates: { ...cfg.templates, ...(input.templates || {}) },
    };
    if (next.provider === "twilio" && (!next.twilioSid || !next.twilioToken || !next.twilioFrom)) {
      throw new ServiceError("VALIDATION", "Twilio needs the Account SID, Auth Token and From number", 400);
    }
    if (next.provider === "http" && !(next.httpUrl && next.httpUrl.includes("{to}") && next.httpUrl.includes("{message}"))) {
      throw new ServiceError("VALIDATION", "The gateway link must contain {to} and {message}", 400);
    }
    await Settings.updateOne({}, { $set: { messaging: next } }, { upsert: true });
    return this.publicConfig();
  },

  /** Who gets a message and what it says. */
  async prepare(input: PrepareInput): Promise<MessageRow[]> {
    const { cfg, school, currency } = await loadConfig();
    const classIds = (input.classIds || []).filter((id) => isValidObjectId(id));
    const rows: MessageRow[] = [];
    const push = (
      st: { _id: unknown; firstName: string; lastName: string; parentName?: string; parentPhone?: string; phone?: string },
      cls: string,
      template: string,
      vars: Record<string, string | number>
    ) => {
      const phone = normalizePhone(st.parentPhone || st.phone, cfg.countryCode);
      const parent = st.parentName || "Parent";
      const student = `${st.firstName} ${st.lastName}`;
      const text = fill(template, { parent, student, class: cls, school, currency, ...vars });
      rows.push({
        studentId: String(st._id),
        student,
        parent,
        className: cls,
        phone,
        text,
        waLink: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : null,
      });
    };

    if (input.kind === "absence") {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date || "");
      if (!m) throw new ServiceError("VALIDATION", "Choose the date", 400);
      const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
      const next = new Date(day.getTime() + 86400000);
      const sheets = await Attendance.find({
        date: { $gte: day, $lt: next },
        ...(classIds.length ? { classId: { $in: classIds } } : {}),
      })
        .populate("classId", "name section")
        .lean();
      const absent = sheets.flatMap((sh) =>
        sh.records
          .filter((r: { status: string }) => r.status === "absent")
          .map((r: { studentId: unknown }) => ({ id: String(r.studentId), cls: classLabel(sh.classId as never) }))
      );
      const students = await Student.find({ _id: { $in: absent.map((a) => a.id) } }).lean();
      for (const a of absent) {
        const st = students.find((s) => String(s._id) === a.id);
        if (st) push(st, a.cls, cfg.templates.absence, { date: prettyDay(day) });
      }
    } else if (input.kind === "fee") {
      const now = new Date();
      const query: Record<string, unknown> = { status: { $in: ["pending", "partial", "overdue"] } };
      if (input.feeScope === "overdue") query.dueDate = { $lt: now };
      if (input.feeScope === "due_soon") {
        query.dueDate = { $gte: now, $lte: new Date(now.getTime() + (input.dueWithinDays || 3) * 86400000) };
      }
      const fees = await Fee.find(query).sort({ dueDate: 1 }).lean();
      const byStudent = new Map<string, { amount: number; due: Date; overdue: boolean }>();
      for (const f of fees) {
        const bal = Math.max(0, (f.amount || 0) - (f.paidAmount || 0));
        if (bal <= 0) continue;
        const key = String(f.studentId);
        const cur = byStudent.get(key) || { amount: 0, due: f.dueDate, overdue: false };
        cur.amount += bal;
        if (f.dueDate < cur.due) cur.due = f.dueDate;
        if (f.dueDate < now) cur.overdue = true;
        byStudent.set(key, cur);
      }
      const students = await Student.find({
        _id: { $in: [...byStudent.keys()] },
        status: "active",
        ...(classIds.length ? { classId: { $in: classIds } } : {}),
      })
        .populate("classId", "name section")
        .lean();
      for (const st of students) {
        const due = byStudent.get(String(st._id))!;
        push(st, classLabel(st.classId as never), cfg.templates.fee, {
          amount: Math.round(due.amount).toLocaleString("en-IN"),
          dueDate: prettyDay(due.due),
          status: due.overdue ? "overdue" : "due",
        });
      }
    } else if (input.kind === "result") {
      if (!input.termId || !isValidObjectId(input.termId) || !classIds.length) {
        throw new ServiceError("VALIDATION", "Choose the exam term and classes", 400);
      }
      const data = await examCenterService.resultCards(input.termId, classIds);
      const ids = data.batches.flatMap((b) => b.cards.map((c) => c.student._id));
      const students = await Student.find({ _id: { $in: ids } }).lean();
      for (const b of data.batches) {
        for (const c of b.cards) {
          if (c.result === "PENDING") continue;
          const st = students.find((s) => String(s._id) === c.student._id);
          if (!st) continue;
          push(st, b.classLabel, cfg.templates.result, {
            term: `${data.term.name} ${data.term.academicYear}`.trim(),
            obtained: c.obtained,
            total: c.totalMarks,
            percent: c.percent,
            grade: c.grade,
            result: c.result,
            position: c.position ? `, position ${c.position} of ${b.stats.complete}` : "",
          });
        }
      }
    } else {
      const text = (input.text || "").trim();
      if (text.length < 3) throw new ServiceError("VALIDATION", "Write the message", 400);
      const students = await Student.find({ status: "active", ...(classIds.length ? { classId: { $in: classIds } } : {}) })
        .populate("classId", "name section")
        .sort({ firstName: 1 })
        .lean();
      for (const st of students) push(st, classLabel(st.classId as never), text, {});
    }
    return rows;
  },

  /**
   * Send the chosen students' messages. With a gateway they go out now; without one the
   * caller opens each WhatsApp link and this records that it was handed over.
   */
  async send(input: PrepareInput, studentIds: string[], session: SessionUser, manual = false) {
    const { cfg } = await loadConfig();
    const wanted = new Set(studentIds);
    const rows = (await this.prepare(input)).filter((r) => wanted.has(r.studentId));
    const results = [];
    for (const r of rows) {
      let status: "sent" | "failed" | "opened" = "opened";
      let error = "";
      const channel = manual || cfg.provider === "none" ? "manual" : cfg.channel;
      if (!r.phone) {
        status = "failed";
        error = "No parent phone number";
      } else if (channel !== "manual") {
        try {
          await deliver(cfg, r.phone, r.text);
          status = "sent";
        } catch (e) {
          status = "failed";
          error = e instanceof Error ? e.message : "Gateway error";
        }
      }
      await MessageLog.create({
        kind: input.kind,
        studentId: r.studentId,
        to: r.phone || "-",
        recipientName: r.parent,
        text: r.text,
        channel,
        status,
        error: error || undefined,
        sentBy: session.id,
      });
      results.push({ studentId: r.studentId, status, error, waLink: r.waLink });
    }
    return {
      results,
      sent: results.filter((r) => r.status === "sent").length,
      opened: results.filter((r) => r.status === "opened").length,
      failed: results.filter((r) => r.status === "failed").length,
    };
  },

  async log(limit = 200) {
    await dbConnect();
    return MessageLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("studentId", "firstName lastName admissionNo")
      .populate("sentBy", "name")
      .lean();
  },

  /** Class list for the pickers. */
  async classes() {
    await dbConnect();
    return ClassModel.find().select("name section").sort({ name: 1, section: 1 }).lean();
  },
};

/** Sends one message through the configured gateway. */
async function deliver(cfg: MessagingConfig, to: string, text: string) {
  if (cfg.provider === "twilio") {
    const prefix = cfg.channel === "whatsapp" ? "whatsapp:" : "";
    const body = new URLSearchParams({ To: `${prefix}+${to}`, From: `${prefix}${cfg.twilioFrom}`, Body: text });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${cfg.twilioSid}:${cfg.twilioToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return;
  }
  if (cfg.provider === "http" && cfg.httpUrl) {
    const url = cfg.httpUrl.replace("{to}", encodeURIComponent(to)).replace("{message}", encodeURIComponent(text));
    const res = await fetch(url, { method: cfg.httpMethod || "GET" });
    if (!res.ok) throw new Error(`Gateway ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return;
  }
  throw new Error("No gateway set up");
}
