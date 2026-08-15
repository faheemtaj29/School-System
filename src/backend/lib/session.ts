import { SignJWT, jwtVerify } from "jose";
import { env } from "@/backend/config/env";
import type { SessionUser } from "@/backend/types";

/** HTTP-only cookie that stores the JWT. */
export const COOKIE_NAME = "school_session";

function getSecret() {
  return new TextEncoder().encode(env.jwtSecret);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as SessionUser["role"],
    };
  } catch {
    return null;
  }
}
