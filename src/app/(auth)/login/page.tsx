"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { getFirebaseAuth } from "@/lib/firebase";

function isFirebaseHostAuthError(code: string | undefined) {
  return code === "auth/app-not-authorized" || code === "auth/unauthorized-domain";
}

function hasFirebaseClientConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  );
}

const isLocalDev = process.env.NODE_ENV !== "production";
const localDevEmail = "devansh04356@gmail.com";
const localDevPassword = "admin123";

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Unable to send reset email.");
      }

      setStatus("sent");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to send reset email.";
      setError(message);
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center animate-fade-in">
        <p className="text-sm text-[#15803d] bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl px-4 py-3 mb-4">
          If an account exists for <strong>{email}</strong>, a temporary password has been sent.
          Check your inbox (and spam folder).
        </p>
        <button onClick={onBack} className="text-sm text-[#2563eb] hover:text-[#1d4ed8] transition-colors">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-lg font-semibold text-[#0f172a] mb-1">Reset password</h2>
      <p className="text-sm text-[#64748b] mb-6">
        Enter your email and we&apos;ll send a temporary password.
      </p>
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[#334155] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              suppressHydrationWarning
              className="input-dark"
              placeholder="you@example.com"
            />
        </div>
        {status === "error" && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={status === "sending"}
          className="btn-primary w-full py-2.5"
        >
          {status === "sending" ? "Sending..." : "Send reset email"}
        </button>
      </form>
      <button
        onClick={onBack}
        suppressHydrationWarning
        className="mt-4 w-full text-sm text-[#64748b] hover:text-[#334155] text-center transition-colors"
      >
        Back to sign in
      </button>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);

  async function signInWithPassword() {
    return signInWithCredentials(email, password);
  }

  async function signInWithCredentials(loginEmail: string, loginPassword: string) {
    const dashboardCallbackUrl = `${window.location.origin}/dashboard`;
    const result = await signIn("credentials", {
      email: loginEmail,
      password: loginPassword,
      redirect: false,
      callbackUrl: dashboardCallbackUrl,
    });

    if (result?.error) {
      setError("Invalid email or password");
      return false;
    }

    router.push("/dashboard");
    return true;
  }

  async function handleDevSignIn() {
    setLoading(true);
    setError("");

    try {
      await signInWithCredentials(localDevEmail, localDevPassword);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const dashboardCallbackUrl = `${window.location.origin}/dashboard`;

    try {
      if (!hasFirebaseClientConfig()) {
        await signInWithPassword();
        return;
      }

      // Sign in with Firebase to get an ID token
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      const idToken = await credential.user.getIdToken();

      // Exchange the Firebase token for a Next-Auth session
      const result = await signIn("credentials", {
        idToken,
        redirect: false,
        callbackUrl: dashboardCallbackUrl,
      });
      if (result?.error) {
        // Firebase auth succeeded but token exchange failed (e.g. missing Admin SDK config).
        // Fall back to local bcrypt credentials.
        await signInWithPassword();
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
        setLoading(false);
        return;
      }
      // Firebase user not found, wrong password, SDK not configured, or any other
      // Firebase error → fall back to legacy bcrypt credentials (covers seeded admin accounts).
      const signedIn = await signInWithPassword();
      if (!signedIn) {
        if (isFirebaseHostAuthError(code)) {
          setError(
            `Firebase blocked this host (${window.location.hostname}). Add it in Firebase Authentication -> Settings -> Authorized domains.`,
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-grid-pattern" style={{ background: "linear-gradient(180deg, #f7f9fc 0%, #eaeff6 100%)" }}>
      {/* Decorative blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10 rounded-[18px] border border-[#e3e8ef] bg-white p-9 shadow-[0_20px_60px_-18px_rgba(15,23,42,0.22)] animate-fade-in-up">
        {showReset ? (
          <ForgotPasswordForm onBack={() => setShowReset(false)} />
        ) : (
          <>
            {/* Branding */}
            <div className="flex flex-col items-center text-center mb-7">
              <BrandLogo size="lg" className="mb-4" />
              <h1 className="text-xl font-semibold text-[#0f172a] tracking-tight">
                Technical Interview Portal
              </h1>
              <p className="text-[#64748b] mt-1.5 text-sm">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-[18px]" autoComplete="off">
              <div>
                <label className="block text-[13px] font-medium text-[#334155] mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  suppressHydrationWarning
                  autoComplete="username"
                  name="email"
                  className="input-dark"
                  placeholder="you@company.com"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[13px] font-medium text-[#334155]">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    suppressHydrationWarning
                    className="text-xs text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  suppressHydrationWarning
                  autoComplete="new-password"
                  name="password"
                  className="input-dark"
                />
              </div>
              {error && <p className="text-red-600 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                suppressHydrationWarning
                className="btn-primary w-full py-3 text-[15px]"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
            {isLocalDev && (
              <button
                type="button"
                onClick={handleDevSignIn}
                disabled={loading}
                suppressHydrationWarning
                className="mt-3 w-full text-sm text-[#64748b] hover:text-[#334155] transition-colors"
              >
                Use local dev account
              </button>
            )}
            <p className="mt-6 text-center text-sm text-[#64748b]">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">
                Create account
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
