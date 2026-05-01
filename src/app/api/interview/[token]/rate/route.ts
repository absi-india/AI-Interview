import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateTest } from "@/lib/rateTest";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const test = await prisma.test.findUnique({
    where: { inviteToken: token },
    select: { id: true, status: true, overallScore: true },
  });

  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (test.status !== "COMPLETED") {
    return NextResponse.json({ error: "Interview not yet completed" }, { status: 400 });
  }
  if (test.overallScore !== null) {
    return NextResponse.json({ ok: true, alreadyRated: true });
  }

  const result = await rateTest(test.id, req.nextUrl.origin);
  return NextResponse.json(result);
}
