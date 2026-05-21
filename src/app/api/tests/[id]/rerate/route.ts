import { auth } from "@/auth";
import { rateTest } from "@/lib/rateTest";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const test = await prisma.test.findUnique({
    where: { id },
    select: { recruiterId: true, status: true },
  });

  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "ADMIN" && test.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (test.status !== "COMPLETED") {
    return NextResponse.json({ error: "Only completed interviews can be re-rated" }, { status: 400 });
  }

  const result = await rateTest(id, req.nextUrl.origin, { force: true });
  return NextResponse.json(result);
}
