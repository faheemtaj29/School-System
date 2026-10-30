import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { requireAuth, jsonError, jsonOk, fromServiceError } from "@/backend/lib/http";

/** Study material files: documents, sheets, slides, images, media and archives. */
const MATERIAL_EXT = /\.(pdf|docx?|xlsx?|csv|pptx?|txt|rtf|odt|ods|odp|png|jpe?g|gif|webp|mp4|webm|mov|mp3|m4a|wav|zip)$/i;

/**
 * Teachers/admins upload lecture recordings (video/audio) to /uploads/lectures, or — with
 * kind=material — study materials (PDF, Word, Excel, PowerPoint, images…) to /uploads/materials.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["admin", "teacher"]);
  if (error) return error;
  try {
    const form = await req.formData();
    const file = form.get("file");
    const material = form.get("kind") === "material";
    if (!(file instanceof File)) {
      return jsonError(material ? "Choose a file to upload" : "Choose a recording file to upload");
    }
    const limit = material ? 50 : 200;
    if (file.size > limit * 1024 * 1024) {
      return jsonError(`File too large (max ${limit} MB)`);
    }
    if (material) {
      if (!MATERIAL_EXT.test(file.name)) {
        return jsonError("Upload a PDF, Word, Excel, PowerPoint, image, video, audio or zip file");
      }
    } else {
      const allowed = /^(video|audio)\//i;
      if (!allowed.test(file.type) && !/\.(mp4|webm|mov|mp3|m4a|wav)$/i.test(file.name)) {
        return jsonError("Upload a video or audio recording (mp4, webm, mov, mp3…)");
      }
    }
    const folder = material ? "materials" : "lectures";
    const dir = path.join(process.cwd(), "public", "uploads", folder);
    await mkdir(dir, { recursive: true });
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${Date.now()}-${safe}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);
    return jsonOk({ url: `/uploads/${folder}/${filename}`, name: file.name, size: file.size }, 201);
  } catch (e) {
    return fromServiceError(e);
  }
}
