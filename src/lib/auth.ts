/**
 * @deprecated Import from `@/backend/lib/*` instead.
 */
export type { SessionUser } from "@/backend/types";
export {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
} from "@/backend/lib/session";
export { hashPassword, verifyPassword } from "@/backend/lib/password";
export {
  setSessionCookie,
  clearSessionCookie,
  getSession,
  getSessionFromRequest,
} from "@/backend/lib/cookies";
