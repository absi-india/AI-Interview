import { prisma } from "@/lib/prisma";
import { BUCKET_RECORDINGS, deleteFile } from "@/lib/minio";
import { createRecordingDbRef, parseRecordingRef } from "@/lib/recording";
import { getLocalResumePath } from "@/lib/resumeFile";
import { ensureStoredFileTable } from "@/lib/storedFile";
import { unlink } from "node:fs/promises";

const RECORDING_RETENTION_DAYS = 7;
/** Enough work for one cron run without risking its time limit. */
const BATCH = 250;

/**
 * Delete recordings once their interview is older than the retention period.
 *
 * The recording is deleted before the reference to it is cleared, which is the
 * opposite of what this did. Clearing the reference first meant that any
 * failure in between — an error, or simply the cron running out of its sixty
 * seconds — left a file that nothing pointed at. Nothing could then ever find
 * it again, because this only ever looks for files by following a reference.
 * That is how 138 recordings came to sit in the database unreachable. In this
 * order a failure leaves the reference intact and the next run tries again.
 */
export async function cleanupExpiredRecordings() {
  const cutoff = new Date(Date.now() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const questions = await prisma.question.findMany({
    where: {
      videoUrl: { not: null },
      test: { status: "COMPLETED", completedAt: { lt: cutoff } },
    },
    select: { id: true, videoUrl: true },
    take: BATCH,
  });

  // Question ids whose recording is confirmed gone, and so may be cleared.
  const cleared: string[] = [];
  const dbFiles: { fileId: string; questionId: string }[] = [];

  await Promise.allSettled(
    questions.map(async (question) => {
      const ref = parseRecordingRef(question.videoUrl);
      if (!ref) {
        cleared.push(question.id); // nothing to delete; the reference is junk
        return;
      }

      if (ref.provider === "db") {
        // Deleted below in one statement, and only then cleared.
        dbFiles.push({ fileId: ref.objectKey, questionId: question.id });
        return;
      }

      if (ref.provider === "minio") {
        await deleteFile(BUCKET_RECORDINGS, ref.objectKey);
        cleared.push(question.id);
        return;
      }

      const localPath = getLocalResumePath(ref.objectKey);
      if (localPath) await unlink(localPath).catch(() => undefined);
      cleared.push(question.id);
    }),
  );

  if (dbFiles.length > 0) {
    await ensureStoredFileTable();
    await prisma.storedFile.deleteMany({
      where: { id: { in: dbFiles.map((f) => f.fileId) }, kind: "recording" },
    });
    // Reached only if the delete succeeded; a throw leaves these references in
    // place for the next run rather than stranding the files.
    cleared.push(...dbFiles.map((f) => f.questionId));
  }

  if (cleared.length > 0) {
    await prisma.question.updateMany({
      where: { id: { in: cleared } },
      data: { videoUrl: null },
    });
  }

  const orphans = await sweepOrphanedRecordings(cutoff);

  return {
    scanned: questions.length,
    deleted: cleared.length,
    failed: questions.length - cleared.length,
    orphansReclaimed: orphans.deleted,
  };
}

/**
 * Delete stored recordings that nothing refers to any more.
 *
 * Files orphaned by the previous ordering are invisible to the pass above,
 * which can only find a file by following a reference to it, so they would sit
 * in the database for good. Only files older than the retention window are
 * considered: a recording is written and its question updated in the same
 * request, and a file in that gap would otherwise look unreferenced.
 */
async function sweepOrphanedRecordings(cutoff: Date) {
  await ensureStoredFileTable();

  // Ids only. Selecting the blobs as well would pull a few hundred megabytes
  // of video into the function's memory just to count them.
  const candidates = await prisma.storedFile.findMany({
    where: { kind: "recording", createdAt: { lt: cutoff } },
    select: { id: true },
    take: BATCH,
  });
  if (candidates.length === 0) return { deleted: 0 };

  const referenced = await prisma.question.findMany({
    where: { videoUrl: { in: candidates.map((c) => createRecordingDbRef(c.id)) } },
    select: { videoUrl: true },
  });
  const stillUsed = new Set(referenced.map((q) => q.videoUrl));

  const orphans = candidates.filter((c) => !stillUsed.has(createRecordingDbRef(c.id)));
  if (orphans.length === 0) return { deleted: 0 };

  await prisma.storedFile.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
  console.info(`[cleanup] reclaimed ${orphans.length} orphaned recording(s)`);
  return { deleted: orphans.length };
}
