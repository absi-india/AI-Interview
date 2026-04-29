import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRecordingPlaybackPath } from "@/lib/recording";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  const { shareToken } = await params;
  const test = await prisma.test.findUnique({
    where: { shareToken },
    include: {
      candidate: { select: { name: true, email: true } },
      questions: { orderBy: { order: "asc" } },
      fraudEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const questions = test.questions.map((q) => ({
    ...q,
    videoUrl: getRecordingPlaybackPath(q.id, q.videoUrl),
  }));

  return NextResponse.json({ test: { ...test, questions } });
}
