import type { NextConfig } from "next";

// Old URLs that should funnel to the canonical domain. Only these exact hosts
// redirect — preview deployments (other *.vercel.app names) are unaffected.
const LEGACY_HOSTS = [
  "ai-interview-absi.vercel.app",
  "ai-interview-omega-lac.vercel.app",
];

const CANONICAL_ORIGIN = "https://tip.absi-usa.net";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.app"],
  serverExternalPackages: ["@napi-rs/canvas"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async redirects() {
    return LEGACY_HOSTS.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: `${CANONICAL_ORIGIN}/:path*`,
      permanent: false,
    }));
  },
};

export default nextConfig;
