/**
 * School profile extras — logo upload, LAN address and full-database backup.
 */
import os from "node:os";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { dbConnect } from "@/backend/config/database";
import { fromServiceError, jsonError, jsonOk, requireAuth } from "@/backend/lib/http";
import { settingsService } from "@/backend/services/settings.service";
import { imageProblem, imageResponse } from "@/backend/lib/images";

export const schoolProfileController = {
  /** Public: the logo also appears on the login screen and printed documents. ?branch=CODE gives a campus's own logo. */
  async getLogo(req: Request) {
    try {
      const branch = new URL(req.url).searchParams.get("branch");
      const logo = (branch && (await settingsService.getBranchLogo(branch))) || (await settingsService.getLogo());
      return imageResponse(logo?.data);
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async uploadLogo(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const body = await req.json().catch(() => ({}));
      const problem = imageProblem(body.dataUrl, "Logo");
      if (problem) return jsonError(problem);
      const branch = new URL(req.url).searchParams.get("branch");
      if (branch) return jsonOk({ logoUrl: await settingsService.setBranchLogo(branch, body.dataUrl) });
      return jsonOk({ logoUrl: await settingsService.setLogo(body.dataUrl) });
    } catch (e) {
      return fromServiceError(e);
    }
  },

  async removeLogo(req: Request) {
    const { error } = await requireAuth(["admin"]);
    if (error) return error;
    try {
      const branch = new URL(req.url).searchParams.get("branch");
      if (branch) await settingsService.setBranchLogo(branch, null);
      else await settingsService.setLogo(null);
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
