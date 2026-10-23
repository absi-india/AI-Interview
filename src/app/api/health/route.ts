import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const isProduction = process.env.NODE_ENV === "production";

interface Check {
  ok: boolean;
  message: string;
}

async function checkDatabase(): Promise<Check> {
  const configuredUrl = process.env.DATABASE_URL;
  const url = configuredUrl ?? "file:./dev.db";
  const usesLocalFile = url.startsWith("file:");

  if (isProduction && usesLocalFile) {
    return {
      ok: false,
      message: "DATABASE_URL points to a local file path in production",
    };
  }

  if (isProduction && url.startsWith("libsql://") && !process.env.DATABASE_AUTH_TOKEN) {
    return { ok: false, message: "DATABASE_AUTH_TOKEN not set for libsql DATABASE_URL" };
  }

  try {
    // Dynamic import to avoid build-time side effects
    const { prisma } = await import("@/lib/prisma");
    await prisma.$queryRaw`SELECT 1`;

    if (!configuredUrl) {
      return { ok: true, message: "Connected (using local SQLite fallback: file:./dev.db)" };
    }

    return { ok: true, message: "Connected" };
  } catch (e) {
    return { ok: false, message: `Query failed: ${(e as Error).message}` };
  }
}

function checkFirebase(): Check {
  const clientRequired = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  ];
  const missingClient = clientRequired.filter((key) => !process.env[key]);

  const adminRequired = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
  const missingAdmin = adminRequired.filter((key) => !process.env[key]);

  if (missingClient.length === 0 && missingAdmin.length === 0) {
    return { ok: true, message: "Config present" };
  }

  if (isProduction) {
    const errors: string[] = [];
    if (missingClient.length > 0) errors.push(`Client SDK missing: ${missingClient.join(", ")}`);
    if (missingAdmin.length > 0) errors.push(`Admin SDK missing: ${missingAdmin.join(", ")}`);
    return { ok: false, message: errors.join(" | ") };
  }

  return { ok: true, message: "Optional in local dev (Firebase auth disabled until configured)" };
}

/**
 * The key the application actually uses.
 *
 * This checked GEMINI_API_KEY and ANTHROPIC_API_KEY, neither of which appears
 * anywhere else in the codebase — question generation, scoring, transcription
 * and resume analysis all read OPENAI_API_KEY. So it reported a healthy AI
 * setup from a Gemini key while every one of those features was dead, which is
 * worse than having no check at all.
 */
function checkAI(): Check {
  if (process.env.OPENAI_API_KEY) return { ok: true, message: "OPENAI_API_KEY set" };

  if (isProduction) {
    return { ok: false, message: "OPENAI_API_KEY not set — scoring, transcription and resume analysis will fail" };
  }
  return { ok: true, message: "Optional in local dev (AI features disabled until configured)" };
}

/**
 * Where interview recordings and resumes will be written.
 *
 * Uploads try object storage first and fall back to a blob column in the
 * database, catching the error on the way. That fallback is invisible: the
 * upload succeeds, so nothing anywhere reports that videos are being written
 * into the database instead. This states plainly which one is in use.
 */
function checkStorage(): Check {
  const endPoint = process.env.MINIO_ENDPOINT;
  const configured = Boolean(endPoint) && endPoint !== "localhost" && endPoint !== "127.0.0.1";

  if (configured) return { ok: true, message: "Object storage configured — recordings go to MinIO" };

  if (isProduction) {
    return {
      ok: false,
      message:
        "MINIO_ENDPOINT not configured — every recording and resume is being stored as a blob inside the database",
    };
  }
  return { ok: true, message: "No object storage locally; recordings are written to public/uploads" };
}

function checkAuth(): Check {
  if (process.env.AUTH_SECRET) return { ok: true, message: "AUTH_SECRET set" };

  if (process.env.NEXTAUTH_SECRET) {
    return { ok: true, message: "NEXTAUTH_SECRET set (deprecated key; prefer AUTH_SECRET)" };
  }

  if (isProduction) return { ok: false, message: "AUTH_SECRET not set" };

  return { ok: true, message: "Optional in local dev (set AUTH_SECRET for stable sessions)" };
}

export async function GET() {
  const [db, firebase, ai, auth] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkFirebase()),
    Promise.resolve(checkAI()),
    Promise.resolve(checkAuth()),
  ]);
  const storage = checkStorage();

  const checks = { db, firebase, ai, auth, storage };
  // Storage is reported but does not fail the endpoint: uploads still succeed
  // when it is unconfigured, they just land somewhere expensive. Turning a
  // working service red would be its own kind of untruth.
  const allOk = [db, firebase, ai, auth].every((check) => check.ok);
  const warnings = Object.entries(checks)
    .filter(([, check]) => !check.ok)
    .map(([name, check]) => `${name}: ${check.message}`);

  return NextResponse.json(
    { ok: allOk, checks, ...(warnings.length ? { warnings } : {}), node: process.version },
    { status: allOk ? 200 : 503 },
  );
}
