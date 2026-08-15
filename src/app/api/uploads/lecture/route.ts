import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireAuth, jsonError, jsonOk, fromServiceError } from "@/backend/lib/http";

/**
 * Teachers/admins upload lecture recordings (video/audio) to /uploads/lectures.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["admin", "teacher"]);
  if (error) return error;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError("Choose a recording file to upload");
    }
    if (file.size > 200 * 1024 * 1024) {
      return jsonError("File too large (max 200 MB)");
    }
    const allowed = /^(video|audio)\//i;
    if (!allowed.test(file.type) && !/\.(mp4|webm|mov|mp3|m4a|wav)$/i.test(file.name)) {
      return jsonError("Upload a video or audio recording (mp4, webm, mov, mp3…)");
    }
    const dir = path.join(process.cwd(), "public", "uploads", "lectures");
    await mkdir(dir, { recursive: true });
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${safe}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    return jsonOk({ url: `/uploads/lectures/${filename}`, name: file.name, size: file.size }, 201);
  } catch (e) {
    return fromServiceError(e);
  }
}
