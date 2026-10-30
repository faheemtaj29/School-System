/**
 * Password endpoints: forgot / reset (public), change (signed in), and reset links the
 * office sends for a student, parent, teacher or staff login (admin).
 */
import { z } from "zod";
import { firstZodError, fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { passwordService } from "@/backend/services/password.service";

/** The address people open the link on (behind a proxy, the forwarded host). */
function originOf(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto");
  return host ? `${proto || "https"}://${host}` : url.origin;
}

export const passwordController = {
  /** POST { email } — always the same answer, so accounts can't be discovered. */
  async forgot(req: Request) {
    try {
      const parsed = z.object({ email: z.string().email("Enter a valid email") }).safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await passwordService.forgot(parsed.data.email, originOf(req)));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** GET ?token= — whether a reset link is still valid. */
  async check(req: Request) {
    try {
      return jsonOk(await passwordService.check(new URL(req.url).searchParams.get("token") || ""));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** POST { token, password } — set a new password from a reset link. */
  async reset(req: Request) {
    try {
      const parsed = z.object({ token: z.string().min(20), password: z.string().max(200) }).safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return jsonError("This reset link is not valid");
      return jsonOk(await passwordService.reset(parsed.data.token, parsed.data.password));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** POST { current, next } — change your own password. */
  async change(req: Request) {
    const { session, error } = await requireAuth();
    if (error) return error;
    try {
      const parsed = z.object({ current: z.string().min(1, "Enter your current password"), next: z.string().max(200) }).safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return jsonError(firstZodError(parsed.error.issues));
      return jsonOk(await passwordService.change(session!, parsed.data.current, parsed.data.next));
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** GET ?kind=student|teacher|staff&id= — the logins that belong to this person (admin). */
  async logins(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const q = new URL(req.url).searchParams;
      const kind = q.get("kind");
      if (kind !== "student" && kind !== "teacher" && kind !== "staff") return jsonError("Unknown kind");
      return jsonOk({ logins: await passwordService.loginsOf(kind, q.get("id") || "") });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** POST { userId } — make a reset link for this login and send it to their phone (admin). */
  async sendLink(req: Request) {
    const { session, error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const parsed = z.object({ userId: z.string().regex(/^[a-f0-9]{24}$/i) }).safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return jsonError("Pick a login");
      return jsonOk(await passwordService.linkFor(parsed.data.userId, originOf(req), session!));
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
