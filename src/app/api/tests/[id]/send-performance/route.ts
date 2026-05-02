import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildAppDomain, sendCandidatePerformanceEmail } from "@/lib/mailer";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const test = await prisma.test.findUnique({
      where: { id },
      include: { candidate: true },
    });

    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.user.role !== "ADMIN" && test.recruiterId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (test.status !== "COMPLETED") {
      return NextResponse.json({ error: "Performance report can be sent after the interview is completed" }, { status: 400 });
    }

    const reportLink = `${buildAppDomain(req.nextUrl.origin)}/results/share/${test.shareToken}`;
    await sendCandidatePerformanceEmail(
      test.candidate.name,
      test.candidate.email,
      test.jobTitle,
      test.overallRating,
      test.overallScore,
      reportLink,
    );

    return NextResponse.json({ ok: true, reportLink });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to send performance email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
