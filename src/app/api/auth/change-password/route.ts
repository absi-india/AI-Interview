import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MIN_LENGTH = 8;

/**
 * Set your own password.
 *
 * A reset issues a generated one and overwrites what was there, and until now
 * there was no way back from it: the only route was another reset, and another
 * generated password. The current password is required, so holding a signed-in
 * session is not by itself enough to take an account over.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Enter your current password and a new one." }, { status: 400 });
  }
  if (newPassword.length < MIN_LENGTH) {
    return NextResponse.json(
      { error: `Your new password must be at least ${MIN_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "Your new password is the same as your current one." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // Someone who signs in through Google has no password here to change.
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "This account signs in with Google, so it has no password to change." },
      { status: 400 },
    );
  }

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    return NextResponse.json({ error: "That is not your current password." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });

  return NextResponse.json({ ok: true });
}
