/**
 * Images stored in the database as data URLs (school logo, student and teacher photos).
 */
import { NextResponse } from "next/server";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export function parseDataUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { type: match[1], bytes: Buffer.from(match[2], "base64") };
}

/** Why an uploaded data URL can't be used, or null when it's fine. */
export function imageProblem(dataUrl: unknown, what = "Image") {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed || !IMAGE_TYPES.includes(parsed.type)) return `${what} must be a PNG, JPG, SVG or WebP image`;
  if (parsed.bytes.length > IMAGE_MAX_BYTES) return `${what} must be 2 MB or smaller`;
  return null;
}

export function imageResponse(dataUrl: string | null | undefined, cache = "public, max-age=31536000, immutable") {
  const parsed = dataUrl ? parseDataUrl(dataUrl) : null;
  if (!parsed) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(parsed.bytes), {
    headers: {
      "Content-Type": parsed.type,
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      // SVGs can carry scripts; never let one run if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

/** Photo URL for a record that has one (cache-busted by its upload time). */
export type PhotoKind = "student" | "teacher" | "staff";
/** API folder for each kind of person ("staff" is already plural). */
export const PHOTO_BASE: Record<PhotoKind, string> = { student: "students", teacher: "teachers", staff: "staff" };

export function photoUrl(kind: PhotoKind, id: unknown, updatedAt?: Date | string | null) {
  return updatedAt ? `/api/${PHOTO_BASE[kind]}/${String(id)}/photo?v=${new Date(updatedAt).getTime()}` : null;
}
