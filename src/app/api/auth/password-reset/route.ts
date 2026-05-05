import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTemporaryPasswordEmail } from "@/lib/mailer";

function generateTemporaryPassword() {
  return randomBytes(9).toString("base64url");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return NextResponse.json({ ok: true });
    }

    const previousPasswordHash = user.passwordHash;
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    try {
      await sendTemporaryPasswordEmail(
        user.name || user.email,
        user.email,
        temporaryPassword,
        req.nextUrl.origin,
      );
    } catch (err) {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: previousPasswordHash },
      });
      throw err;
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unable to send reset email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
