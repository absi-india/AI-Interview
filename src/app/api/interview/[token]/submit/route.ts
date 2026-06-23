import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const test = await prisma.test.findUnique({ where: { inviteToken: token } });
  if (!test || test.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Invalid or inactive interview" }, { status: 400 });
  }

  const completedAt = new Date();
  const timeUsedSeconds = test.startedAt
    ? Math.floor((completedAt.getTime() - test.startedAt.getTime()) / 1000)
    : null;

  await prisma.test.update({
    where: { id: test.id },
    data: { status: "COMPLETED", completedAt, timeUsedSeconds },
  });

  // Run AI scoring after the response is sent — no Redis needed.
  // after() keeps the function alive on Vercel until scoring completes.
  const testId = test.id;
  const origin = req.nextUrl.origin;
  after(async () => {
    const { rateTest } = await import("@/lib/rateTest");
    await rateTest(testId, origin).catch((err: unknown) => {
      console.error("[submit] background rateTest failed", err);
    });
  });

  return NextResponse.json({ ok: true });
}
