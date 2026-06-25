import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ATTENTION_EVENT_TYPES = new Set([
  "SCREEN_OR_TAB_CHANGE",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
]);
const MAX_PROCTORING_VIOLATIONS = 3;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();
  const { type, severity, detail } = body;

  // Use after() so the Prisma write runs after the response is sent but is
  // guaranteed to complete before the serverless function is torn down.
  after(async () => {
    const test = await prisma.test.findUnique({
      where: { inviteToken: token },
      select: { id: true, status: true },
    });
    if (!test || test.status !== "IN_PROGRESS") return;

    if (ATTENTION_EVENT_TYPES.has(type)) {
      const existingCount = await prisma.fraudEvent.count({
        where: { testId: test.id, type: { in: Array.from(ATTENTION_EVENT_TYPES) } },
      });
      if (existingCount >= MAX_PROCTORING_VIOLATIONS) return;
    }

    await prisma.fraudEvent.create({
      data: { testId: test.id, type, severity, detail: detail ?? "" },
    });
  });

  return NextResponse.json({ ok: true });
}
