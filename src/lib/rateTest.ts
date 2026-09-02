import "server-only";
import { prisma } from "@/lib/prisma";
import { rateAnswersBatch } from "@/lib/claude";
import { transcribeRecordingDetailed } from "@/lib/transcribe";
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
  options: { force?: boolean; retranscribe?: boolean } = {},
): Promise<{
  ok: boolean;
  alreadyRated?: boolean;
  /** How the recovery went, so a caller can report it rather than guess. */
  transcription?: { attempted: number; recovered: number; reasons: string[] };
}> {
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

  // Fallback: some answers recorded a video but the browser's live speech-to-text
  // produced no transcript (it silently stops on tab changes / network blips).
  // Transcribe the recording server-side so the spoken answer isn't lost.
  // Normally only a blank transcript is recovered. A transcript can also come
  // back wrong rather than missing — the recogniser drops mid-answer and leaves
  // a fragment — and because a fragment is not blank it was never retried, so
  // re-scoring returned the same low mark for ever. retranscribe re-reads the
  // recording regardless of what is already stored.
  const needsTranscription = pool.filter(
    (q) =>
      Boolean(q.videoUrl) &&
      (options.retranscribe ||
        ((q.transcript?.trim() ?? "") === "" && (q.codeResponse?.trim() ?? "") === ""))
  );
  // Reported back so a recovery that achieved nothing says so, instead of
  // looking identical to a successful one that changed no scores.
  const transcription = { attempted: needsTranscription.length, recovered: 0, reasons: [] as string[] };

  if (needsTranscription.length > 0) {
    await Promise.all(
      needsTranscription.map(async (q) => {
        const { text, error } = await transcribeRecordingDetailed(q.videoUrl);
        const clean = text?.trim();
        if (clean) {
          // Persist immediately so partial progress survives a function timeout.
          await prisma.question.update({ where: { id: q.id }, data: { transcript: clean } });
          q.transcript = clean; // reflect locally so the answered/blank split below sees it
          transcription.recovered += 1;
        } else if (error) {
          transcription.reasons.push(error);
        }
      })
    );
  }

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
    const blankRationale = "No answer was captured for this question — the candidate may have submitted early, skipped this question, or run out of time. This question has been excluded from the overall score. If a video recording is available, please review it manually.";
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
    // All questions were blank/unanswered — finalize with 0 so the UI
    // doesn't stay stuck at "Rating in progress..." forever.
    await prisma.test.update({
      where: { id: testId },
      data: { overallScore: 0, overallRating: "No Answers" },
    });
    return { ok: true, transcription };
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

  return { ok: true, transcription };
}
