import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const [{ auth }, { prisma }, { generateQuestions }, { getResumeContext }] = await Promise.all([
      import("@/auth"),
      import("@/lib/prisma"),
      import("@/lib/claude"),
      import("@/lib/resumeContext"),
    ]);

    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const test = await prisma.test.findUnique({
      where: { id },
      include: { candidate: { select: { resumeUrl: true } } },
    });

    if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (session.user.role !== "ADMIN" && test.recruiterId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (test.status !== "QUESTIONS_PENDING") {
      return NextResponse.json({ error: "Cannot regenerate after approval" }, { status: 400 });
    }

    const resumeContext = await getResumeContext(test.candidate.resumeUrl);
    const result = await generateQuestions(test.level, test.jobTitle, test.jobDescription, resumeContext);

    // Delete old questions and create new ones
    await prisma.question.deleteMany({ where: { testId: id } });
    await prisma.question.createMany({
      data: result.questions.map((q) => ({
        testId: id,
        order: q.id,
        questionText: q.questionText,
        category: q.category,
        expectedSummary: q.expectedAnswerSummary,
        maxScore: q.maxScore,
        codeLanguageHint: q.codeLanguageHint ?? null,
      })),
    });

    return NextResponse.json({ ok: true, debug: result.debug });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to regenerate questions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
