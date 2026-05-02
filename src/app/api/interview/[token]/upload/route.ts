import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadRecording } from "@/lib/minio";
import { createRecordingDbRef, createRecordingLocalRef, createRecordingMinioRef } from "@/lib/recording";
import { ensureStoredFileTable } from "@/lib/storedFile";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 60;

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

  if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });
  if (!transcriptText && !codeText && videoSize <= 0) {
    console.warn("[interview/upload] Empty response rejected", { token, questionId });
    return NextResponse.json({ error: "No transcript, written response, or recording was received" }, { status: 400 });
  }

  const question = await prisma.question.findUnique({ where: { id: questionId } });
  if (!question || question.testId !== test.id) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  let videoUrl: string | null = null;
  if (videoBlob && videoSize > 0) {
    const buffer = Buffer.from(await videoBlob.arrayBuffer());
    try {
      const objectKey = await uploadRecording(test.id, questionId, buffer);
      videoUrl = createRecordingMinioRef(objectKey);
    } catch (err) {
      console.warn("[interview/upload] Object storage unavailable; saving recording fallback", err);

      if (process.env.NODE_ENV === "production") {
        await ensureStoredFileTable();
        const stored = await prisma.storedFile.create({
          data: {
            kind: "recording",
            fileName: `${questionId}.webm`,
            contentType: "video/webm",
            data: buffer,
          },
        });
        videoUrl = createRecordingDbRef(stored.id);
      } else {
        const relativePublicPath = `/uploads/recordings/${test.id}/${questionId}.webm`;
        const absoluteDir = path.join(process.cwd(), "public", "uploads", "recordings", test.id);
        await mkdir(absoluteDir, { recursive: true });
        await writeFile(path.join(absoluteDir, `${questionId}.webm`), buffer);
        videoUrl = createRecordingLocalRef(relativePublicPath);
      }
    }
  }

  await prisma.question.update({
    where: { id: questionId },
    data: {
      transcript: transcriptText || undefined,
      codeResponse: codeText || undefined,
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
