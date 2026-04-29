import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const test = await prisma.test.findUnique({
      where: { inviteToken: token },
      include: {
        candidate: { select: { name: true, email: true } },
        questions: { orderBy: { order: "asc" }, select: { id: true, order: true, questionText: true, category: true, codeLanguageHint: true } },
      },
    });

    if (!test) return NextResponse.json({ error: "Invalid interview link" }, { status: 404 });

    if (test.status === "EXPIRED" || (test.inviteExpiresAt && test.inviteExpiresAt < new Date())) {
      return NextResponse.json({ error: "This interview link has expired" }, { status: 410 });
    }

    if (test.status === "COMPLETED") {
      return NextResponse.json({ error: "This interview has already been completed" }, { status: 409 });
    }

    if (!["INVITED", "IN_PROGRESS"].includes(test.status)) {
      return NextResponse.json({ error: "Interview is not ready" }, { status: 400 });
    }

    return NextResponse.json({
      testId: test.id,
      candidateName: test.candidate.name,
      jobTitle: test.jobTitle,
      level: test.level,
      status: test.status,
      questions: test.questions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load interview";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
