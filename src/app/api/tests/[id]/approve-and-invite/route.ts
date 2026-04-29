import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildInviteLink, sendInterviewInvite } from "@/lib/mailer";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const test = await prisma.test.findUnique({
      where: { id },
      include: { candidate: true, questions: true },
    });

    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.user.role !== "ADMIN" && test.recruiterId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["QUESTIONS_PENDING", "INVITED"].includes(test.status)) {
      return NextResponse.json({ error: "Test is not in an inviteable state" }, { status: 400 });
    }

    const body = await req.json();
    const { edits } = body as { edits: Record<string, string> };

    // Save any edited question text
    await Promise.all(
      Object.entries(edits ?? {}).map(([questionId, newText]) => {
        const original = test.questions.find((q) => q.id === questionId);
        if (!original || original.questionText === newText) return Promise.resolve();
        return prisma.question.update({
          where: { id: questionId },
          data: { questionText: newText, isModified: true },
        });
      })
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inviteLink = buildInviteLink(test.inviteToken, req.nextUrl.origin);

    // Keep status in sync with invitation attempts and allow re-sending from review page.
    await prisma.test.update({
      where: { id },
      data: { status: "INVITED", inviteExpiresAt: expiresAt },
    });

    try {
      await sendInterviewInvite(
        test.candidate.name,
        test.candidate.email,
        test.jobTitle,
        test.inviteToken,
        req.nextUrl.origin,
      );
      return NextResponse.json({ ok: true, inviteLink });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send invite";
      return NextResponse.json(
        {
          error: `${message} You can still copy and share the invite link manually.`,
          inviteLink,
        },
        { status: 502 },
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send invite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
