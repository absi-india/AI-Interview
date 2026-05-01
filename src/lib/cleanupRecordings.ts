import { prisma } from "@/lib/prisma";
import { BUCKET_RECORDINGS, deleteFile } from "@/lib/minio";
import { parseRecordingRef } from "@/lib/recording";
import { getLocalResumePath } from "@/lib/resumeFile";
import { ensureStoredFileTable } from "@/lib/storedFile";
import { unlink } from "node:fs/promises";

const RECORDING_RETENTION_DAYS = 7;

export async function cleanupExpiredRecordings() {
  const cutoff = new Date(Date.now() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const questions = await prisma.question.findMany({
    where: {
      videoUrl: { not: null },
      test: {
        status: "COMPLETED",
        completedAt: { lt: cutoff },
      },
    },
    select: {
      id: true,
      videoUrl: true,
    },
    take: 250,
  });

  if (questions.length === 0) {
    return { scanned: 0, deleted: 0 };
  }

  const dbFileIds: string[] = [];

  await Promise.allSettled(
    questions.map(async (question) => {
      const ref = parseRecordingRef(question.videoUrl);
      if (!ref) return;

      if (ref.provider === "db") {
        dbFileIds.push(ref.objectKey);
        return;
      }

      if (ref.provider === "minio") {
        await deleteFile(BUCKET_RECORDINGS, ref.objectKey);
        return;
      }

      const localPath = getLocalResumePath(ref.objectKey);
      if (localPath) {
        await unlink(localPath).catch(() => undefined);
      }
    }),
  );

  await prisma.question.updateMany({
    where: { id: { in: questions.map((question) => question.id) } },
    data: { videoUrl: null },
  });

  if (dbFileIds.length > 0) {
    await ensureStoredFileTable();
    await prisma.storedFile.deleteMany({
      where: {
        id: { in: dbFileIds },
        kind: "recording",
      },
    });
  }

  return { scanned: questions.length, deleted: questions.length };
}
