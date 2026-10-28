import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function imageExtension(buffer: Buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["admin", "teacher"]);
  if (error) return error;

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Choose a profile photo to upload");
    if (file.size === 0) return jsonError("The selected photo is empty");
    if (file.size > MAX_FILE_SIZE) return jsonError("Photo is too large (maximum 5 MB)");

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = imageExtension(buffer);
    if (!extension) return jsonError("Upload a valid JPG, PNG, or WebP image");

    const directory = path.join(process.cwd(), "public", "uploads", "profiles");
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(path.join(directory, filename), buffer, { flag: "wx" });
    return jsonOk({ url: `/uploads/profiles/${filename}` }, 201);
  } catch (e) {
    return fromServiceError(e);
  }
}
