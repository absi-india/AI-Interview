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
  // pdf-parse loads its pdf.js worker from its own package directory at
  // runtime. Bundled into a chunk, that file is left behind and every PDF
  // upload fails with "Setting up fake worker failed", so it has to stay a
  // real dependency the server resolves from node_modules.
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  // Leaving it external is not enough on its own: the worker is reached by a
  // path built at runtime, so file tracing cannot see the reference and drops
  // it from the deployed bundle. Naming it here puts it back. Verified by
  // checking for it under .next/standalone after a build — a local `next
  // start` cannot catch this, because it still has the whole node_modules.
  outputFileTracingIncludes: {
    "/api/resume-format/analyze": ["./node_modules/pdf-parse/dist/**/pdf.worker.mjs"],
  },
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
