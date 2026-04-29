import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enqueueAiRating } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
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

  // Enqueue AI rating (best-effort — may fail if Redis is unavailable)
  try {
    await enqueueAiRating(test.id);
  } catch {
    // Redis not running in dev — rating will be skipped
  }

  return NextResponse.json({ ok: true });
}
