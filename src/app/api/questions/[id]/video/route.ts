import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { BUCKET_RECORDINGS, getPresignedUrl } from "@/lib/minio";
import { parseRecordingRef } from "@/lib/recording";
import { getLocalResumePath } from "@/lib/resumeFile";
import { readFile } from "node:fs/promises";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const question = await prisma.question.findUnique({
    where: { id },
    include: { test: { select: { recruiterId: true } } },
  });

  if (!question?.videoUrl) return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  if (session.user.role !== "ADMIN" && question.test.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ref = parseRecordingRef(question.videoUrl);
  if (!ref) return NextResponse.json({ error: "Recording not found" }, { status: 404 });

  if (ref.provider === "local") {
    const localPath = getLocalResumePath(ref.objectKey);
    if (!localPath) return NextResponse.json({ error: "Invalid recording path" }, { status: 404 });

    const buffer = await readFile(localPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Length": buffer.byteLength.toString(),
        "Content-Type": "video/webm",
      },
    });
  }

  const url = await getPresignedUrl(BUCKET_RECORDINGS, ref.objectKey, 60 * 30);
  return NextResponse.redirect(url);
}
