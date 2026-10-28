/**
 * Signed links to one fee challan, for parents who open it from WhatsApp/SMS without logging in.
 * The token is the fee id plus an HMAC of it, so a link can't be changed to reach another challan.
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
