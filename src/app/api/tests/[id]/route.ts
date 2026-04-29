import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRecordingPlaybackPath } from "@/lib/recording";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await prisma.test.findUnique({
    where: { id },
    include: {
      candidate: true,
      recruiter: { select: { id: true, name: true, email: true } },
      questions: { orderBy: { order: "asc" } },
      fraudEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "ADMIN" && test.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const questions = test.questions.map((q) => ({
    ...q,
    videoUrl: getRecordingPlaybackPath(q.id, q.videoUrl),
  }));

  return NextResponse.json({ test: { ...test, questions } });
}
