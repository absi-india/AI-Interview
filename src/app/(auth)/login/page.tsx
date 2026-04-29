"use client";
import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

interface ServiceCheck {
  ok: boolean;
  message: string;
}

interface HealthData {
  ok: boolean;
  checks: {
    db: ServiceCheck;
    firebase: ServiceCheck;
    ai: ServiceCheck;
    auth: ServiceCheck;
  };
  node: string;
}

function isFirebaseHostAuthError(code: string | undefined) {
  return code === "auth/app-not-authorized" || code === "auth/unauthorized-domain";
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-400" : "bg-red-400"}`}
      style={{ boxShadow: ok ? "0 0 6px rgba(52,211,153,0.5)" : "0 0 6px rgba(248,113,113,0.5)" }}
    />
  );
}

function HealthPanel() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data: HealthData) => {
        setHealth(data);
        if (!data.ok) setExpanded(true);
      })
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
        Checking system status…
      </div>
    );
  }

  if (!health) {
    return (
      <div className="mt-6 pt-4 border-t border-white/5 text-xs text-slate-500">
        System status unavailable
      </div>
    );
  }

  const labels: Record<keyof HealthData["checks"], string> = {
    db: "Database",
    firebase: "Firebase",
    ai: "AI Service",
    auth: "Auth Secret",
  };

  return (
    <div className="mt-6 pt-4 border-t border-white/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 w-full text-left transition-colors"
      >
        <StatusDot ok={health.ok} />
        <span className="flex-1">
          {health.ok ? "All systems operational" : "System issues detected"}
        </span>
        <span className="text-slate-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 animate-fade-in">
          {(Object.entries(health.checks) as [keyof HealthData["checks"], ServiceCheck][]).map(
            ([key, check]) => (
              <div key={key} className="flex items-start gap-2 text-xs">
                <StatusDot ok={check.ok} />
                <span className="font-medium text-slate-400 w-20 flex-shrink-0">{labels[key]}</span>
                <span className={check.ok ? "text-slate-500" : "text-red-400"}>{check.message}</span>
              </div>
            ),
          )}
          <p className="text-xs text-slate-600 pt-1">Node {health.node}</p>
        </div>
      )}
    </div>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
      setStatus("sent");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        // Don't reveal whether the email exists — just say sent
        setStatus("sent");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
        setStatus("error");
      } else {
        setError("Unable to send reset email. Check your Firebase configuration.");
        setStatus("error");
      }
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center animate-fade-in">
        <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4">
          If an account exists for <strong>{email}</strong>, a password reset link has been sent.
          Check your inbox (and spam folder).
        </p>
        <button onClick={onBack} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-lg font-semibold text-white mb-1">Reset password</h2>
      <p className="text-sm text-slate-400 mb-6">
        Enter your email and we&apos;ll send a reset link via Firebase.
      </p>
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-dark"
              placeholder="you@example.com"
            />
        </div>
        {status === "error" && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={status === "sending"}
          className="btn-primary w-full py-2.5"
        >
          {status === "sending" ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <button
        onClick={onBack}
        className="mt-4 w-full text-sm text-slate-400 hover:text-slate-300 text-center transition-colors"
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const dashboardCallbackUrl = `${window.location.origin}/dashboard`;

    try {
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
        const fallback = await signIn("credentials", {
          email,
          password,
          redirect: false,
          callbackUrl: dashboardCallbackUrl,
        });
        if (fallback?.error) {
          setError("Account not found or inactive. Contact your administrator.");
        } else {
          router.push("/dashboard");
        }
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
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: dashboardCallbackUrl,
      });
      if (result?.error) {
        if (isFirebaseHostAuthError(code)) {
          setError(
            `Firebase blocked this host (${window.location.hostname}). Add it in Firebase Authentication -> Settings -> Authorized domains.`,
          );
        } else {
          setError("Invalid email or password");
        }
      } else {
        router.push("/dashboard");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-grid-pattern" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      {/* Decorative blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md glass-card p-8 relative z-10 animate-fade-in-up">
        {showReset ? (
          <ForgotPasswordForm onBack={() => setShowReset(false)} />
        ) : (
          <>
            {/* ABSI Branding */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 shadow-lg" style={{ boxShadow: "0 8px 32px rgba(59,130,246,0.3)" }}>
                <span className="text-2xl font-black text-white tracking-tight">A</span>
              </div>
              <h1 className="text-2xl font-bold text-white">
                <span className="text-gradient">ABSI</span> Interview Portal
              </h1>
              <p className="text-slate-400 text-sm mt-1">American Business Solutions Inc.</p>
            </div>

            <p className="text-slate-400 mb-6 text-sm text-center">Sign in to your account</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-dark"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-slate-300">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="input-dark"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2.5"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="mt-6 text-center text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Create account
              </Link>
            </p>
          </>
        )}
        <HealthPanel />
      </div>
    </div>
  );
}
