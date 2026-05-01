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

function getRatingLabel(score: number): string {
  for (const [threshold, label] of RATING_LABELS) {
    if (score >= threshold) return label;
  }
  return "Poor";
}

export async function rateTest(
  testId: string,
  fallbackOrigin?: string,
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
  if (test.overallScore !== null) return { ok: true, alreadyRated: true };

  const ratings = await Promise.all(
    test.questions.map(async (q) => {
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
    })
  );

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
