import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  SESSION_ORIGIN_EVENT,
  formatSessionOrigin,
  hasAnySessionOrigin,
  readSessionOrigin,
} from "@/lib/sessionOrigin";

/**
 * Record where the interview was taken from, for the integrity report.
 * Deliberately swallows every error: this is supporting information and must
 * never be able to stop a candidate starting their interview.
 */
async function recordSessionOrigin(testId: string, req: NextRequest) {
  try {
    const origin = readSessionOrigin(req.headers);
    if (!hasAnySessionOrigin(origin)) return;
    await prisma.fraudEvent.create({
      data: {
        testId,
        type: SESSION_ORIGIN_EVENT,
        severity: "LOW",
        detail: formatSessionOrigin(origin),
      },
    });
  } catch (err) {
    console.warn("[start] could not record session origin", err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const test = await prisma.test.findUnique({ where: { inviteToken: token } });

    if (!test) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (test.status === "COMPLETED") return NextResponse.json({ error: "Already completed" }, { status: 409 });
    if (test.inviteExpiresAt && test.inviteExpiresAt < new Date()) {
      return NextResponse.json({ error: "Link expired" }, { status: 410 });
    }
    if (!["INVITED", "IN_PROGRESS"].includes(test.status)) {
      return NextResponse.json({ error: "This interview is not ready to start yet. Please contact your recruiter." }, { status: 409 });
    }

    if (test.status === "INVITED") {
      await prisma.test.update({
        where: { id: test.id },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      // Only on the genuine first start, so a reconnect does not add duplicates.
      await recordSessionOrigin(test.id, req);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start interview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
