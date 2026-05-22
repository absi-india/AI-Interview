import "server-only";
import { prisma } from "@/lib/prisma";
import { rateAnswer } from "@/lib/claude";
import { sendRatingCompleteEmail } from "@/lib/mailer";

const RATING_LABELS: Array<[number, string]> = [
  [9, "Excellent"],
  [8, "Good"],
  [6, "Average"],
  [4, "Below Average"],
  [0, "Poor"],
];

const RATING_REQUEST_SPACING_MS = 1200;
const RATING_BATCH_SIZE = 10;

type RateableTest = { level: string };
type RateableQuestion = {
  id: string;
  questionText: string;
  category: string;
  expectedSummary: string;
  transcript: string | null;
  codeResponse: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRatingLabel(score: number): string {
  for (const [threshold, label] of RATING_LABELS) {
    if (score >= threshold) return label;
  }
  return "Poor";
}

async function rateQuestion(test: RateableTest, q: RateableQuestion) {
  const result = await rateAnswer(
    q.questionText,
    q.category,
    q.expectedSummary,
    q.transcript,
    q.codeResponse,
    test.level
  );

  await prisma.question.update({
    where: { id: q.id },
    data: { aiScore: result.score, aiRationale: result.rationale },
  });

  return result.score;
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

  const questionsToRate = options.force
    ? test.questions
    : test.questions.filter((q) => q.aiScore === null);

  for (let idx = 0; idx < questionsToRate.length; idx += RATING_BATCH_SIZE) {
    if (idx > 0) await sleep(RATING_REQUEST_SPACING_MS);

    const batch = questionsToRate.slice(idx, idx + RATING_BATCH_SIZE);
    await Promise.all(batch.map((q) => rateQuestion(test, q)));
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
