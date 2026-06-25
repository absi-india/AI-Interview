import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateTest } from "@/lib/rateTest";
import { cleanupExpiredRecordings } from "@/lib/cleanupRecordings";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Complete abandoned interviews — browser crash or network drop during interview
  // leaves the test IN_PROGRESS forever. Mark them COMPLETED so they get scored.
  const abandonedCutoff = new Date(Date.now() - 35 * 60 * 1000);
  const abandoned = await prisma.test.findMany({
    where: { status: "IN_PROGRESS", startedAt: { lt: abandonedCutoff } },
    select: { id: true, startedAt: true },
  });
  if (abandoned.length > 0) {
    await Promise.all(
      abandoned.map((t) => {
        const completedAt = t.startedAt
          ? new Date(t.startedAt.getTime() + 30 * 60 * 1000)
          : new Date();
        const timeUsedSeconds = t.startedAt
          ? Math.floor((completedAt.getTime() - t.startedAt.getTime()) / 1000)
          : null;
        return prisma.test.update({
          where: { id: t.id },
          data: { status: "COMPLETED", completedAt, timeUsedSeconds },
        });
      })
    );
  }

  const test = await prisma.test.findFirst({
    where: { status: "COMPLETED", overallScore: null },
    orderBy: { completedAt: "asc" },
    select: { id: true },
  });

  if (!test) {
    const cleanup = await cleanupExpiredRecordings();
    return NextResponse.json({ ok: true, processed: 0, abandoned: abandoned.length, cleanup });
  }

  const result = await rateTest(test.id, req.nextUrl.origin);
  const cleanup = await cleanupExpiredRecordings();
  return NextResponse.json({ ...result, testId: test.id, processed: 1, abandoned: abandoned.length, cleanup });
}
