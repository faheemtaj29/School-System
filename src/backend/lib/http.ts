/**
 * Shared HTTP helpers for API controllers.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/backend/lib/cookies";
import { ServiceError, statusForCode, type SessionUser } from "@/backend/types";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function fromServiceError(error: unknown) {
  if (error instanceof ServiceError) {
    return jsonError(error.message, error.status || statusForCode(error.code));
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Internal server error";
  if (message.includes("duplicate") || message.includes("E11000")) {
    return jsonError("Record already exists", 409);
  }
  return jsonError(message, 500);
}

export async function requireAuth(roles?: SessionUser["role"][]) {
  const session = await getSession();
  if (!session) {
    return { session: null as SessionUser | null, error: jsonError("Unauthorized", 401) };
  }
  if (roles && !roles.includes(session.role)) {
    return { session: null as SessionUser | null, error: jsonError("Forbidden", 403) };
  }
  return { session, error: null };
}

/** Parse Zod result or return first error message. */
export function firstZodError(issues: { message: string }[]) {
  return issues[0]?.message ?? "Invalid input";
}

export function parseOptionalDate(value?: string | null) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
