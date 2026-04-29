import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const tests = await prisma.test.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        candidate: { select: { name: true } },
        recruiter: { select: { name: true } },
      },
    });
    return NextResponse.json({ tests });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch tests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
