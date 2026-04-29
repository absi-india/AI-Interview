import { Queue } from "bullmq";
import IORedis from "ioredis";

let connection: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

let aiRatingQueue: Queue | null = null;

export function getAiRatingQueue(): Queue {
  if (!aiRatingQueue) {
    aiRatingQueue = new Queue("ai-rating", { connection: getRedisConnection() });
  }
  return aiRatingQueue;
}

export async function enqueueAiRating(testId: string) {
  const queue = getAiRatingQueue();
  await queue.add("rate", { testId }, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });
}
