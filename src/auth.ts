import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { firebaseAdmin } from "@/lib/firebase-admin";

const devFallbackSecret =
  process.env.NODE_ENV === "production" ? undefined : "local-dev-auth-secret-change-me";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? devFallbackSecret,
  providers: [
    Credentials({
      credentials: {
        // Firebase flow: pass idToken only
        idToken: { label: "Firebase ID Token", type: "text" },
        // Legacy bcrypt flow: pass email + password
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const idToken = credentials?.idToken as string | undefined;

        // ── Firebase ID token path ──────────────────────────────────────
        if (idToken) {
          try {
            const decoded = await firebaseAdmin.verifyIdToken(idToken);
            let user = await prisma.user.findFirst({
              where: {
                OR: [
                  { firebaseUid: decoded.uid },
                  { email: decoded.email ?? "" },
                ],
              },
            });

            if (!user) {
              // Firebase auth succeeded but no DB record — auto-provision the user.
              // This handles accounts created before the DB was fully set up.
              const email = decoded.email;
              if (!email) return null;
              user = await prisma.user.create({
                data: {
                  firebaseUid: decoded.uid,
                  email,
                  name: decoded.name ?? email.split("@")[0],
                  role: "RECRUITER",
                  isActive: true,
                },
              });
            }

            if (!user.isActive) return null;

            // Sync firebaseUid if not already set
            if (!user.firebaseUid) {
              await prisma.user.update({
                where: { id: user.id },
                data: { firebaseUid: decoded.uid },
              });
            }

            return { id: user.id, email: user.email, name: user.name, role: user.role };
          } catch {
            return null;
          }
        }

        // ── Legacy bcrypt path (admin seeded accounts) ──────────────────
        const email = typeof credentials?.email === "string" ? credentials.email.trim() : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        try {
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user || !user.isActive || !user.passwordHash) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] Credentials rejected", {
                email,
                found: Boolean(user),
                isActive: user?.isActive,
                hasPasswordHash: Boolean(user?.passwordHash),
              });
            }
            return null;
          }

          const valid = await bcrypt.compare(password, user.passwordHash);
          if (!valid) {
            if (process.env.NODE_ENV !== "production") {
              console.warn("[auth] Credentials password mismatch", { email });
            }
            return null;
          }

          return { id: user.id, email: user.email, name: user.name, role: user.role };
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[auth] Credentials lookup failed", err);
          }
          return null;
        }
      },
    }),
  ],
});
