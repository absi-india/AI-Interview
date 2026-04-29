import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { firebaseAdmin } from "@/lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";
    const rawName = typeof body?.name === "string" ? body.name : "";
    const name = rawName.trim();

    if (!name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (idToken) {
      // Verify the Firebase ID token
      const decoded = await firebaseAdmin.verifyIdToken(idToken);
      const { uid, email } = decoded;
      if (!email) {
        return NextResponse.json({ error: "Firebase account has no email" }, { status: 400 });
      }

      // Prevent duplicate accounts
      const existing = await prisma.user.findFirst({
        where: { OR: [{ firebaseUid: uid }, { email }] },
      });
      if (existing) {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 },
        );
      }

      await prisma.user.create({
        data: {
          firebaseUid: uid,
          email,
          name,
          role: "RECRUITER",
          isActive: true,
        },
      });

      return NextResponse.json({ ok: true }, { status: 201 });
    }

    // Local fallback path when Firebase Admin is not configured.
    const rawEmail = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const email = rawEmail.trim().toLowerCase();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        passwordHash,
        email,
        name,
        role: "RECRUITER",
        isActive: true,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Registration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
