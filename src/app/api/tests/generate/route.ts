import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateQuestions } from "@/lib/claude";
import { getResumeContext } from "@/lib/resumeContext";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
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

    let resumeContext = "";
    try {
      resumeContext = await getResumeContext(candidate.resumeUrl);
    } catch (err) {
      console.warn("[tests/generate] Resume context unavailable", err);
    }

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
