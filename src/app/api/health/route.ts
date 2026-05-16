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

function checkAI(): Check {
  const gemini = process.env.GEMINI_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;

  if (!gemini && !anthropic) {
    if (isProduction) {
      return { ok: false, message: "No AI API key set (GEMINI_API_KEY or ANTHROPIC_API_KEY)" };
    }
    return { ok: true, message: "Optional in local dev (AI features disabled until configured)" };
  }

  const provider = anthropic ? "Anthropic" : "Gemini";
  return { ok: true, message: `${provider} key present` };
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

  const checks = { db, firebase, ai, auth };
  const allOk = Object.values(checks).every((check) => check.ok);

  return NextResponse.json(
    { ok: allOk, checks, node: process.version },
    { status: allOk ? 200 : 503 },
  );
}
