import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the server to be reached from any host on the LAN
  allowedDevOrigins: ["*"],
};

export default nextConfig;
