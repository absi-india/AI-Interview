import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // Fire-and-forget: respond immediately, process async
  const responsePromise = NextResponse.json({ ok: true });

  const body = await req.json();
  const { type, severity, detail } = body;

  prisma.test
    .findUnique({ where: { inviteToken: token }, select: { id: true, status: true } })
    .then(async (test) => {
      if (!test) return;
      if (test.status !== "IN_PROGRESS") return;

      if (ATTENTION_EVENT_TYPES.has(type)) {
        const existingCount = await prisma.fraudEvent.count({
          where: { testId: test.id, type: { in: Array.from(ATTENTION_EVENT_TYPES) } },
        });

        if (existingCount >= MAX_PROCTORING_VIOLATIONS) return;
      }

      return prisma.fraudEvent.create({
        data: { testId: test.id, type, severity, detail: detail ?? "" },
      });
    })
    .catch(() => undefined);

  return responsePromise;
}
