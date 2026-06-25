import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadRecording } from "@/lib/minio";
import { createRecordingDbRef, createRecordingLocalRef, createRecordingMinioRef } from "@/lib/recording";
import { ensureStoredFileTable } from "@/lib/storedFile";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const test = await prisma.test.findUnique({ where: { inviteToken: token } });
  if (!test || test.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Invalid or inactive interview" }, { status: 400 });
  }

  const formData = await req.formData();
  const questionId = formData.get("questionId") as string;
  const transcript = formData.get("transcript") as string | null;
  const codeResponse = formData.get("codeResponse") as string | null;
  const videoBlob = formData.get("video") as File | null;
  const transcriptText = transcript?.trim() ?? "";
  const codeText = codeResponse?.trim() ?? "";
  const videoSize = videoBlob?.size ?? 0;
  const recordingContentType = videoBlob?.type || "video/webm";
  const recordingExtension = recordingContentType.includes("mp4") ? "mp4" : "webm";

  if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });
  if (videoSize <= 0 && !transcriptText && !codeText) {
    return NextResponse.json({ error: "No response data received" }, { status: 400 });
  }
  if (videoSize > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: `Video file is too large (${Math.round(videoSize / 1024 / 1024)}MB). Check your browser settings or contact your recruiter.` },
      { status: 413 }
    );
  }

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question || question.testId !== test.id) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  let videoUrl: string | null = null;
  if (videoBlob && videoSize > 0) {
    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    try {
      const objectKey = await uploadRecording(test.id, questionId, buffer, recordingExtension, recordingContentType);
      videoUrl = createRecordingMinioRef(objectKey);
    } catch (err) {
      console.warn("[interview/upload] Object storage unavailable; saving recording fallback", err);

      if (process.env.NODE_ENV === "production") {
        await ensureStoredFileTable();
        const stored = await prisma.storedFile.create({
          data: {
            kind: "recording",
            fileName: `${questionId}.${recordingExtension}`,
            contentType: recordingContentType,
            data: buffer,
          },
        });
        videoUrl = createRecordingDbRef(stored.id);
      } else {
        const relativePublicPath = `/uploads/recordings/${test.id}/${questionId}.${recordingExtension}`;
        const absoluteDir = path.join(process.cwd(), "public", "uploads", "recordings", test.id);
        await mkdir(absoluteDir, { recursive: true });
        await writeFile(path.join(absoluteDir, `${questionId}.${recordingExtension}`), buffer);
        videoUrl = createRecordingLocalRef(relativePublicPath);
      }
    }
  }

  await prisma.question.update({
    where: { id: questionId },
    data: {
      // null clears stale data from a previous partial upload; undefined would
      // silently preserve old garbage if this upload sends empty text.
      transcript: transcriptText || null,
      codeResponse: codeText || null,
      // Video is only updated when a new file was actually uploaded — we never
      // want to wipe an existing clip just because this retry had no new video.
      videoUrl: videoUrl ?? undefined,
    },
  });

  console.log("[interview/upload] Saved response", {
    testId: test.id,
    questionId,
    transcriptLength: transcriptText.length,
    codeLength: codeText.length,
    videoSize,
    hasVideoUrl: Boolean(videoUrl),
  });

  return NextResponse.json({ ok: true });
}
