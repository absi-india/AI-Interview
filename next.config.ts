import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app"],
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
