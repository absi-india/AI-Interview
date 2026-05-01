import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const [{ auth }, { prisma }, { generateQuestions }, { getResumeContext }] = await Promise.all([
      import("@/auth"),
      import("@/lib/prisma"),
      import("@/lib/claude"),
      import("@/lib/resumeContext"),
    ]);

    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { candidateId, jobTitle, jobDescription, level } = body;

    if (!candidateId || !jobTitle || !jobDescription || !level) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validLevels = ["BASIC", "INTERMEDIATE", "ADVANCED", "PRACTICAL"];
    if (!validLevels.includes(level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (session.user.role !== "ADMIN" && candidate.recruiterId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resumeContext = await getResumeContext(candidate.resumeUrl);

    console.info("[tests/generate] Generating questions", {
      candidateId,
      level,
      jobTitle,
      hasResumeContext: Boolean(resumeContext),
    });

    const result = await generateQuestions(level, jobTitle, jobDescription, resumeContext);

    const test = await prisma.test.create({
      data: {
        candidateId,
        recruiterId: session.user.id,
        jobTitle,
        jobDescription,
        level,
        status: "QUESTIONS_PENDING",
        questions: {
          create: result.questions.map((q) => ({
            order: q.id,
            questionText: q.questionText,
            category: q.category,
            expectedSummary: q.expectedAnswerSummary,
            maxScore: q.maxScore,
            codeLanguageHint: q.codeLanguageHint ?? null,
          })),
        },
      },
    });

    return NextResponse.json({ testId: test.id, debug: result.debug }, { status: 201 });
  } catch (err: unknown) {
    console.error("[tests/generate] Failed", err);
    const message = err instanceof Error ? err.message : "Failed to generate questions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
