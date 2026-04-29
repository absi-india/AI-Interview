import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResumeFileRef } from "@/lib/resume";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      tests: {
        orderBy: { createdAt: "desc" },
        include: { questions: { select: { aiScore: true } } },
      },
    },
  });

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "ADMIN" && candidate.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resumeFile = parseResumeFileRef(candidate.resumeUrl);
  const resumeDownloadPath = resumeFile
    ? resumeFile.provider === "local"
      ? resumeFile.objectKey
      : `/api/candidates/${candidate.id}/resume`
    : null;

  return NextResponse.json({
    candidate: {
      ...candidate,
      resumeText: resumeFile ? "" : (candidate.resumeUrl ?? ""),
      resumeFileName: resumeFile?.fileName ?? null,
      resumeDownloadPath,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.candidate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "ADMIN" && existing.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const hasResumeField = Object.prototype.hasOwnProperty.call(body ?? {}, "resume");
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

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    const updateData: {
      name: string;
      email: string;
      phone: string;
      resumeUrl?: string | null;
    } = {
      name,
      email,
      phone,
    };

    if (hasResumeField) {
      updateData.resumeUrl = resume ? resume : null;
    }

    const candidate = await prisma.candidate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ candidate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update candidate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.candidate.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.user.role !== "ADMIN" && existing.recruiterId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const tests = await tx.test.findMany({
        where: { candidateId: id },
        select: { id: true },
      });
      const testIds = tests.map((test) => test.id);

      if (testIds.length > 0) {
        await tx.fraudEvent.deleteMany({ where: { testId: { in: testIds } } });
        await tx.question.deleteMany({ where: { testId: { in: testIds } } });
        await tx.test.deleteMany({ where: { id: { in: testIds } } });
      }

      await tx.candidate.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete candidate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
