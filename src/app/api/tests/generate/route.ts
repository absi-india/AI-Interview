import { type NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function cleanQuestionText(value: string) {
  return value.replace(/^\s*(?:q\s*)?\d+\s*[\).:-]\s*/i, "").replace(/^\s*[-*\u2022]\s*/, "").trim();
}

function parseTrainingQuestions(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .filter((item): item is string => typeof item === "string")
      .map(cleanQuestionText)
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof input !== "string") return [];

  const text = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const paragraphs = text.split(/\n\s*\n+/).map(cleanQuestionText).filter(Boolean);
  if (paragraphs.length > 1) return paragraphs.slice(0, 20);

  return text
    .split("\n")
    .map(cleanQuestionText)
    .filter(Boolean)
    .slice(0, 20);
}

export async function POST(req: NextRequest) {
  try {
    const [{ auth }, { prisma }] = await Promise.all([
      import("@/auth"),
      import("@/lib/prisma"),
    ]);

    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { candidateId, level } = body;
    const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle.trim() : "";
    const jobDescription = typeof body?.jobDescription === "string" ? body.jobDescription.trim() : "";

    if (!candidateId || !level) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validLevels = ["BASIC", "INTERMEDIATE", "ADVANCED", "PRACTICAL", "TRAINING"];
    if (!validLevels.includes(level)) {
      return NextResponse.json({ error: "Invalid level" }, { status: 400 });
    }

    const isTraining = level === "TRAINING";
    if (!isTraining && (!jobTitle || !jobDescription)) {
      return NextResponse.json({ error: "Job title and job description are required" }, { status: 400 });
    }

    const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (session.user.role !== "ADMIN" && candidate.recruiterId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isTraining) {
      const questions = parseTrainingQuestions(body?.trainingQuestions ?? body?.questions);
      if (questions.length === 0) {
        return NextResponse.json({ error: "Add at least one training question" }, { status: 400 });
      }

      const test = await prisma.test.create({
        data: {
          candidateId,
          recruiterId: session.user.id,
          jobTitle: jobTitle || "Training",
          jobDescription: jobDescription || "Training questions supplied manually.",
          level,
          status: "QUESTIONS_PENDING",
          questions: {
            create: questions.map((questionText, idx) => ({
              order: idx + 1,
              questionText,
              category: "training",
              expectedSummary: "Manual training question. Review the candidate response directly.",
              maxScore: 10,
              codeLanguageHint: null,
            })),
          },
        },
      });

      return NextResponse.json({ testId: test.id }, { status: 201 });
    }

    const [{ generateQuestions }, { getResumeContext }] = await Promise.all([
      import("@/lib/claude"),
      import("@/lib/resumeContext"),
    ]);

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
