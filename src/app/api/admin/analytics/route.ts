import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalCandidates,
      totalCompleted,
      testsThisMonth,
      fraudThisMonth,
      completedTests,
    ] = await Promise.all([
      prisma.candidate.count(),
      prisma.test.count({ where: { status: "COMPLETED" } }),
      prisma.test.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.fraudEvent.count({ where: { occurredAt: { gte: startOfMonth } } }),
      prisma.test.findMany({
        where: { status: "COMPLETED", overallScore: { not: null } },
        select: { level: true, overallScore: true },
      }),
    ]);

    // Average score by level
    const levels = ["BASIC", "INTERMEDIATE", "ADVANCED", "PRACTICAL"];
    const avgByLevel = levels.map((level) => {
      const tests = completedTests.filter((t) => t.level === level && t.overallScore !== null);
      const avg = tests.length
        ? tests.reduce((s, t) => s + (t.overallScore ?? 0), 0) / tests.length
        : 0;
      return { level, avg: Math.round(avg * 10) / 10, count: tests.length };
    });

    return NextResponse.json({
      totalCandidates,
      totalCompleted,
      testsThisMonth,
      fraudThisMonth,
      avgByLevel,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
