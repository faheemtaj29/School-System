/**
 * Parent messages API.
 * GET ?view=config|log|classes · PUT gateway settings (admin) · POST { action: prepare|send, ... }
 */
import { z } from "zod";
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { messagingService } from "@/backend/services/messaging.service";

const id = z.string().regex(/^[a-f\d]{24}$/i);
const prepareSchema = z.object({
  kind: z.enum(["absence", "fee", "result", "datesheet", "custom"]),
  date: z.string().optional(),
  classIds: z.array(id).max(200).optional(),
  feeScope: z.enum(["unpaid", "overdue", "due_soon"]).optional(),
  dueWithinDays: z.coerce.number().int().min(1).max(60).optional(),
  termId: z.string().optional(),
  text: z.string().max(1000).optional(),
  batch: z.string().regex(/^[A-Z0-9]{4,30}$/).optional(),
  onlyStudents: z.array(id).max(3000).optional(),
});
const actionSchema = prepareSchema.extend({
  action: z.enum(["prepare", "send"]),
  studentIds: z.array(id).max(3000).optional(),
  /** Staff opened WhatsApp themselves — just record it. */
  manual: z.boolean().optional(),
});
const configSchema = z.object({
  provider: z.enum(["none", "twilio", "http"]).optional(),
  channel: z.enum(["sms", "whatsapp"]).optional(),
  countryCode: z.string().regex(/^\d{1,4}$/, "Country code is digits only, e.g. 92 or 91").optional(),
  twilioSid: z.string().trim().max(80).optional(),
  twilioToken: z.string().trim().max(120).optional(),
  twilioFrom: z.string().trim().max(40).optional(),
  httpUrl: z.string().trim().url().max(1000).optional().or(z.literal("")),
  httpMethod: z.enum(["GET", "POST"]).optional(),
  templates: z
    .object({ absence: z.string().max(1000), fee: z.string().max(1000), result: z.string().max(1000), datesheet: z.string().max(1000) })
    .partial()
    .optional(),
});

export const messagingController = {
  async get(req: Request) {
    const view = new URL(req.url).searchParams.get("view") || "config";
    const { error } = await requireAuth(view === "log" ? ["admin", "staff"] : ["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      if (view === "log") return jsonOk({ log: await messagingService.log() });
      if (view === "classes") return jsonOk({ classes: await messagingService.classes() });
      return jsonOk({ config: await messagingService.publicConfig() });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async saveConfig(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = configSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const { httpUrl, ...rest } = parsed.data;
      return jsonOk({ config: await messagingService.saveConfig({ ...rest, ...(httpUrl ? { httpUrl } : {}) }) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async post(req: Request) {
    const { session, error } = await requireAuth(["admin", "staff", "teacher"]);
    if (error) return error;
    try {
      const parsed = actionSchema.safeParse(await req.json());
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      const { action, studentIds, manual, ...input } = parsed.data;
      // Teachers may tell parents about absences; fee, result and custom messages are office work.
      if (session!.role === "teacher" && input.kind !== "absence") return jsonError("Forbidden", 403);
      // Challan links in fee messages point at the address the office is using.
      const fwdHost = req.headers.get("x-forwarded-host");
      const baseUrl = fwdHost ? `${req.headers.get("x-forwarded-proto") || "https"}://${fwdHost}` : new URL(req.url).origin;
      const withBase = { ...input, baseUrl };
      if (action === "prepare") return jsonOk({ rows: await messagingService.prepare(withBase) });
      if (!studentIds?.length) return jsonError("Choose who to send to");
      return jsonOk(await messagingService.send(withBase, studentIds, session!, Boolean(manual)));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
