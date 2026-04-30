import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function inferCodeLanguageHint(jobTitle: string, jobDescription: string) {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  if (text.includes("typescript") || text.includes("react") || text.includes("node")) return "typescript";
  if (text.includes("javascript")) return "javascript";
  if (text.includes("python")) return "python";
  if (text.includes("java")) return "java";
  if (text.includes("aws") || text.includes("ec2") || text.includes("devops")) return "bash";
  return null;
}

function buildQuestions(level: string, jobTitle: string, jobDescription: string, resumeContext: string) {
  const topics = [jobTitle, jobDescription, resumeContext]
    .join(" ")
    .toLowerCase()
    .match(/[a-z0-9+#./-]{2,}/g)
    ?.filter((word, index, list) => list.indexOf(word) === index)
    .slice(0, 8);
  const mainTopic = topics?.[0] ?? jobTitle;
  const secondaryTopic = topics?.[1] ?? "production systems";
  const codeLanguageHint = level === "PRACTICAL" ? inferCodeLanguageHint(jobTitle, jobDescription) : null;

  const prompts = [
    `Explain the core responsibilities of a ${jobTitle} role and how ${mainTopic} fits into day-to-day work.`,
    `What are the key fundamentals someone should know about ${mainTopic} before working on this role?`,
    `Describe a production issue involving ${mainTopic}. How would you investigate and resolve it?`,
    `How would you design a reliable workflow using ${mainTopic} and ${secondaryTopic}?`,
    `What best practices would you follow for security, monitoring, and maintainability in this role?`,
    `Which metrics or logs would you check first when a ${jobTitle} system becomes slow or unreliable?`,
    `Explain a past project or task where you used skills related to ${mainTopic}. What did you personally do?`,
    `What common mistakes should be avoided when working with ${mainTopic}?`,
    `How would you test changes for this ${jobTitle} role before releasing them to production?`,
    `If you had to explain ${mainTopic} to a junior teammate, what would you emphasize and why?`,
  ];

  return prompts.map((questionText, index) => ({
    id: index + 1,
    questionText: `Q${index + 1}: ${questionText}`,
    category: [
      "fundamentals",
      "fundamentals",
      "debugging",
      "system design",
      "best practices",
      "observability",
      "past experience",
      "risk management",
      "testing",
      "communication",
    ][index],
    expectedAnswerSummary:
      "A strong answer should be specific to the job description, mention practical trade-offs, and include concrete examples rather than only definitions.",
    maxScore: 10,
    codeLanguageHint,
  }));
}

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

    const resumeContext = candidate.resumeUrl ?? "";

    console.info("[tests/generate] Generating built-in questions", {
      candidateId,
      level,
      jobTitle,
      hasResumeContext: Boolean(resumeContext),
    });

    const questions = buildQuestions(level, jobTitle, jobDescription, resumeContext);
    const debug = {
      systemPrompt: "Built-in question generation was used for this deployment.",
      userPrompt: `Interview Level: ${level}\nJob Title: ${jobTitle}\nJob Description: ${jobDescription}\nCandidate Resume Context: ${resumeContext || "No resume context provided"}`,
      rawResponse: "Generated 10 fallback questions without calling an external AI provider.",
    };

    const test = await prisma.test.create({
      data: {
        candidateId,
        recruiterId: session.user.id,
        jobTitle,
        jobDescription,
        level,
        status: "QUESTIONS_PENDING",
        questions: {
          create: questions.map((q) => ({
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

    return NextResponse.json({ testId: test.id, debug }, { status: 201 });
  } catch (err: unknown) {
    console.error("[tests/generate] Failed", err);
    const message = err instanceof Error ? err.message : "Failed to generate questions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
