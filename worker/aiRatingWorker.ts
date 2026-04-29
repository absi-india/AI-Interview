import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { rateAnswer } from "../src/lib/claude";
import { sendRatingCompleteEmail } from "../src/lib/mailer";

const url = process.env.DATABASE_URL ?? "file:./dev.db";
const adapter = new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

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

const worker = new Worker(
  "ai-rating",
  async (job) => {
    const { testId } = job.data as { testId: string };
    console.log(`[worker] Rating test ${testId}`);

    const test = await prisma.test.findUnique({
      where: { id: testId },
      include: {
        questions: true,
        recruiter: { select: { email: true } },
        candidate: { select: { name: true } },
      },
    });

    if (!test) { console.error(`Test ${testId} not found`); return; }

    // Rate all 10 questions in parallel
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

    const overallScore = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    const overallRating = getRatingLabel(overallScore);

    await prisma.test.update({
      where: { id: testId },
      data: { overallScore, overallRating },
    });

    // Notify recruiter
    try {
      await sendRatingCompleteEmail(
        test.recruiter.email,
        test.candidate.name,
        overallRating,
        overallScore,
        testId
      );
    } catch { /* SMTP may not be configured in dev */ }

    console.log(`[worker] Done — ${test.candidate.name}: ${overallRating} (${overallScore}/10)`);
  },
  { connection, concurrency: 3 }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] Job ${job?.id} failed:`, err.message);
});

console.log("[worker] AI Rating Worker started, listening for jobs…");
