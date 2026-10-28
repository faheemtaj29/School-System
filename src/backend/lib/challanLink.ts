/**
 * Signed links to one document — a fee challan, a student's result card or a class date
 * sheet — for parents who open it from WhatsApp/SMS without logging in. The token carries
 * the ids plus an HMAC of them, so a link can't be changed to reach another document.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/backend/config/env";

function sig(feeId: string) {
  return createHmac("sha256", env.jwtSecret).update(`challan:${feeId}`).digest("base64url").slice(0, 22);
}

export function challanToken(feeId: string) {
  return `${feeId}.${sig(feeId)}`;
}

/** The fee id inside a valid token, or null. */
export function verifyChallanToken(token: string) {
  const [feeId, given] = String(token || "").split(".");
  if (!/^[a-f0-9]{24}$/i.test(feeId || "") || !given) return null;
  const want = Buffer.from(sig(feeId));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got) ? feeId : null;
}

/** Full public URL of a challan, e.g. https://school.example.com/challan/<token>. */
export function challanUrl(baseUrl: string, feeId: string) {
  return `${baseUrl.replace(/\/$/, "")}/challan/${challanToken(feeId)}`;
}

/** Documents shared by link besides challans: r = result card (term, class, student), d = date sheet (term, class). */
export type ShareKind = "r" | "d";

function shareSig(kind: ShareKind, ids: string[]) {
  return createHmac("sha256", env.jwtSecret).update(`share:${kind}:${ids.join(":")}`).digest("base64url").slice(0, 22);
}

export function shareToken(kind: ShareKind, ids: string[]) {
  return `${kind}-${ids.join("-")}.${shareSig(kind, ids)}`;
}

/** { kind, ids } for a valid share token, or null. */
export function verifyShareToken(token: string) {
  const [head, given] = String(token || "").split(".");
  const [kind, ...ids] = String(head || "").split("-");
  if ((kind !== "r" && kind !== "d") || !given || !ids.length || ids.some((x) => !/^[a-f0-9]{24}$/i.test(x))) return null;
  const want = Buffer.from(shareSig(kind, ids));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got) ? { kind: kind as ShareKind, ids } : null;
}

export function shareUrl(baseUrl: string, kind: ShareKind, ids: string[]) {
  return `${baseUrl.replace(/\/$/, "")}/share/${shareToken(kind, ids)}`;
}
