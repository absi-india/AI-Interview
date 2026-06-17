import "server-only";
import { prisma } from "@/lib/prisma";
import { rateAnswersBatch } from "@/lib/claude";
import { sendRatingCompleteEmail } from "@/lib/mailer";

const RATING_LABELS: Array<[number, string]> = [
  [9, "Excellent"],
  [8, "Good"],
  [6, "Average"],
  [4, "Below Average"],
  [0, "Poor"],
];

function getRatingLabel(score: number): string {
  for (const [threshold, label] of RATING_LABELS) {
    if (score >= threshold) return label;
  }
  return "Poor";
}

export async function rateTest(
  testId: string,
  fallbackOrigin?: string,
  options: { force?: boolean } = {},
): Promise<{ ok: boolean; alreadyRated?: boolean }> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: {
      questions: true,
      recruiter: { select: { email: true } },
      candidate: { select: { name: true } },
    },
  });

  if (!test || test.status !== "COMPLETED") return { ok: false };
  if (test.overallScore !== null && !options.force) return { ok: true, alreadyRated: true };

  const pool = options.force
    ? test.questions
    : test.questions.filter((q) => q.aiScore === null);

  const answeredQuestions = pool.filter(
    (q) => (q.transcript?.trim() ?? "") !== "" || (q.codeResponse?.trim() ?? "") !== ""
  );
  const blankQuestions = pool.filter(
    (q) => (q.transcript?.trim() ?? "") === "" && (q.codeResponse?.trim() ?? "") === ""
  );

  if (answeredQuestions.length > 0) {
    const ratingResults = await rateAnswersBatch(
      answeredQuestions.map((question) => ({
        id: question.id,
        questionText: question.questionText,
        category: question.category,
        expectedAnswerSummary: question.expectedSummary,
        transcript: question.transcript,
        codeResponse: question.codeResponse,
        hasVideo: Boolean(question.videoUrl),
      })),
      test.level
    );

    await prisma.$transaction(
      ratingResults.map((result) =>
        prisma.question.update({
          where: { id: result.id },
          data: { aiScore: result.score, aiRationale: result.rationale },
        })
      )
    );
  }

  if (blankQuestions.length > 0) {
    const blankRationale = "The 30-minute interview timer ran out before the candidate reached or completed this question — no spoken response or written answer was captured. This question has been excluded from the overall score. If a video recording is available, please review it manually.";
    await prisma.$transaction(
      blankQuestions.map((q) =>
        prisma.question.update({
          where: { id: q.id },
          data: { aiScore: null, aiRationale: blankRationale },
        })
      )
    );
  }

  const scoredQuestions = await prisma.question.findMany({
    where: { testId, aiScore: { not: null } },
    select: { aiScore: true },
  });
  const ratings = scoredQuestions
    .map((q) => q.aiScore)
    .filter((score): score is number => typeof score === "number");

  if (ratings.length === 0) {
    await prisma.test.update({
      where: { id: testId },
      data: { overallScore: null, overallRating: null },
    });
    return { ok: false };
  }

  const overallScore =
    Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  const overallRating = getRatingLabel(overallScore);

  await prisma.test.update({
    where: { id: testId },
    data: { overallScore, overallRating },
  });

  try {
    await sendRatingCompleteEmail(
      test.recruiter.email,
      test.candidate.name,
      overallRating,
      overallScore,
      testId,
      fallbackOrigin,
    );
  } catch {
    // SMTP may not be configured
  }

  return { ok: true };
}
