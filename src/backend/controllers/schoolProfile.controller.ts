/**
 * School profile extras — logo upload, LAN address and full-database backup.
 */
import os from "node:os";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { dbConnect } from "@/backend/config/database";
import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { settingsService } from "@/backend/services/settings.service";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

function parseDataUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:([a-z+/]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { type: match[1], bytes: Buffer.from(match[2], "base64") };
}

export const schoolProfileController = {
  /** Public: the logo also appears on the login screen and printed documents. */
  async getLogo() {
    try {
      const logo = await settingsService.getLogo();
      const parsed = logo ? parseDataUrl(logo.data) : null;
      if (!parsed) return new NextResponse(null, { status: 404 });
      return new NextResponse(new Uint8Array(parsed.bytes), {
        headers: {
          "Content-Type": parsed.type,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          // SVGs can carry scripts; never let one run if opened directly.
          "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async uploadLogo(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json().catch(() => ({}));
      const parsed = parseDataUrl(body.dataUrl);
      if (!parsed || !LOGO_TYPES.includes(parsed.type)) {
        return jsonError("Logo must be a PNG, JPG, SVG or WebP image");
      }
      if (parsed.bytes.length > LOGO_MAX_BYTES) {
        return jsonError("Logo must be 2 MB or smaller");
      }
      return jsonOk({ logoUrl: await settingsService.setLogo(body.dataUrl) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeLogo() {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      await settingsService.setLogo(null);
      return jsonOk({ logoUrl: null });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  /** Addresses other computers on the same WiFi/LAN can open in their browser. */
  async network(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    const host = req.headers.get("host") || "";
    const port = host.includes(":") ? host.split(":").pop() : process.env.PORT || "3000";
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((n): n is os.NetworkInterfaceInfo => !!n && n.family === "IPv4" && !n.internal)
      .map((n) => `http://${n.address}:${port}`);
    return jsonOk({ addresses, port });
  },

  /** Full database export as one Extended-JSON file (restorable with mongoimport or a script). */
  async backup() {
    const { error, session } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      await dbConnect();
      const db = mongoose.connection.db;
      if (!db) return jsonError("Database not connected", 500);
      const collections = await db.listCollections({}, { nameOnly: true }).toArray();
      const data: Record<string, unknown[]> = {};
      for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
        if (name.startsWith("system.")) continue;
        data[name] = await db.collection(name).find({}).toArray();
      }
      const payload = {
        app: "school-system",
        createdAt: new Date().toISOString(),
        createdBy: session?.email,
        database: db.databaseName,
        collections: data,
      };
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      return new NextResponse(mongoose.mongo.BSON.EJSON.stringify(payload, { relaxed: false }), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="school-backup-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return fromServiceError(e);
    }
  },
};
