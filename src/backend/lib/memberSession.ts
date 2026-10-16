/**
 * Sessions for public marketplace members (buyers / private sellers).
 *
 * Deliberately separate from staff sessions: different cookie, a key derived
 * with a distinct label, and an audience claim. A member token pasted into the
 * staff cookie fails signature verification, so it can never reach staff APIs.
 */
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { env } from "@/backend/config/env";

export const MEMBER_COOKIE = "market_member";
const AUDIENCE = "market-member";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type MemberSession = { id: string; name: string; phone: string };

function key() {
  return new TextEncoder().encode(`${env.jwtSecret}::market-member::v1`);
}

export async function createMemberToken(m: MemberSession) {
  return new SignJWT({ name: m.name, phone: m.phone })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(m.id)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key());
}

export async function verifyMemberToken(token: string): Promise<MemberSession | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: AUDIENCE });
    if (!payload.sub) return null;
    return { id: payload.sub, name: String(payload.name), phone: String(payload.phone) };
  } catch {
    return null;
  }
}

export async function startMemberSession(m: MemberSession) {
  const store = await cookies();
  store.set(MEMBER_COOKIE, await createMemberToken(m), {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endMemberSession() {
  const store = await cookies();
  store.delete(MEMBER_COOKIE);
}

export async function getMember(): Promise<MemberSession | null> {
  const store = await cookies();
  const token = store.get(MEMBER_COOKIE)?.value;
  return token ? verifyMemberToken(token) : null;
}
