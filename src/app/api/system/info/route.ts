import { networkInterfaces } from "os";
import { requireAuth } from "@/backend/lib/http";

export async function GET() {
  const { error } = await requireAuth(["admin"]);
  if (error) return error;

  const nets = networkInterfaces();
  const ips: { iface: string; address: string }[] = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push({ iface: name, address: net.address });
      }
    }
  }

  const port = process.env.PORT ?? 3000;

  return Response.json({
    ips,
    port,
    lanUrls: ips.map((ip) => `http://${ip.address}:${port}`),
    version: process.env.npm_package_version ?? "1.0.0",
    nodeEnv: process.env.NODE_ENV,
    platform: process.platform,
  });
}
