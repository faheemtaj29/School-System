import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { env } from "@/backend/config/env";
import {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
} from "@/backend/lib/session";
import type { SessionUser } from "@/backend/types";

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.sessionMaxAge,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function startSession(user: SessionUser) {
  const token = await createSessionToken(user);
  await setSessionCookie(token);
  return token;
}
