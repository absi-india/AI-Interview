import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const where = session.user.role === "ADMIN" ? {} : { recruiterId: session.user.id };
    const candidates = await prisma.candidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        tests: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return NextResponse.json({ candidates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch candidates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const rawName = typeof body?.name === "string" ? body.name : "";
    const rawEmail = typeof body?.email === "string" ? body.email : "";
    const rawPhone = typeof body?.phone === "string" ? body.phone : "";
    const rawResume = typeof body?.resume === "string" ? body.resume : "";

    const name = rawName.trim();
    const email = rawEmail.trim().toLowerCase();
    const phone = rawPhone.trim();
    const resume = rawResume.trim();

    if (!name || !email || !phone) {
      return NextResponse.json({ error: "Name, email and phone are required" }, { status: 400 });
    }

    const candidate = await prisma.candidate.create({
      data: {
        name,
        email,
        phone,
        resumeUrl: resume ? resume : null,
        recruiterId: session.user.id,
      },
    });
    return NextResponse.json({ candidate }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create candidate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
