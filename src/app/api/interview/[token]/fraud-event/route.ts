import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Fire-and-forget: respond immediately, process async
  const responsePromise = NextResponse.json({ ok: true });

  const body = await req.json();
  const { type, severity, detail } = body;

  prisma.test
    .findUnique({ where: { inviteToken: token }, select: { id: true } })
    .then((test) => {
      if (!test) return;
      return prisma.fraudEvent.create({
        data: { testId: test.id, type, severity, detail: detail ?? "" },
      });
    })
    .catch(() => undefined);

  return responsePromise;
}
