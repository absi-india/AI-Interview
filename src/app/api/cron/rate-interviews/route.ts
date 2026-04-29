import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateTest } from "@/lib/rateTest";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const test = await prisma.test.findFirst({
    where: { status: "COMPLETED", overallScore: null },
    orderBy: { completedAt: "asc" },
    select: { id: true },
  });

  if (!test) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const result = await rateTest(test.id);
  return NextResponse.json({ ...result, testId: test.id, processed: 1 });
}
