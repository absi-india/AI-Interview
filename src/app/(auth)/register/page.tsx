"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

function shouldFallbackToPasswordRegistration(message: string | undefined) {
  return Boolean(message && message.includes("Firebase Admin env vars are not set"));
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function registerWithPasswordFallback() {
    const fallbackRes = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    const fallbackData: unknown = await fallbackRes.json().catch(() => ({}));
    const fallbackMessage =
      typeof fallbackData === "object" &&
      fallbackData &&
      "error" in fallbackData &&
      typeof fallbackData.error === "string"
        ? fallbackData.error
        : undefined;

    if (!fallbackRes.ok) {
      setError(fallbackMessage ?? "Registration failed. Please try again.");
      return false;
    }

    const fallbackSignIn = await signIn("credentials", { email, password, redirect: false });
    if (fallbackSignIn?.error) {
      setError("Account created but sign-in failed. Please go to the login page.");
      return false;
    }

    router.push("/dashboard");
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Create Firebase user
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
      await updateProfile(credential.user, { displayName: name });
      const idToken = await credential.user.getIdToken();

      // Sync to our database
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name }),
      });

      if (!res.ok) {
        const data: unknown = await res.json().catch(() => ({}));
        const message =
          typeof data === "object" && data && "error" in data && typeof data.error === "string"
            ? data.error
            : undefined;

        if (shouldFallbackToPasswordRegistration(message)) {
          // If Admin SDK is not configured, use local password registration fallback.
          await credential.user.delete().catch(() => undefined);
          await registerWithPasswordFallback();
          return;
        }

        // Delete the Firebase user so they can retry
        await credential.user.delete().catch(() => undefined);
        setError(message ?? "Registration failed. Please try again.");
        return;
      }

      // Sign in via Next-Auth
      const result = await signIn("credentials", { idToken, redirect: false });
      if (result?.error) {
        setError("Account created but sign-in failed. Please go to the login page.");
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/email-already-in-use") {
        setError("An account with this email already exists.");
      } else if (code === "auth/invalid-email") {
        setError("Invalid email address.");
      } else if (code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else {
        await registerWithPasswordFallback();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-grid-pattern" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      {/* Decorative blobs */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md glass-card p-8 relative z-10 animate-fade-in-up">
        {/* ABSI Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-4 shadow-lg" style={{ boxShadow: "0 8px 32px rgba(59,130,246,0.3)" }}>
            <span className="text-2xl font-black text-white tracking-tight">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Create account</h1>
          <p className="text-slate-400 text-sm mt-1">Join the <span className="text-gradient font-semibold">ABSI</span> Interview Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Full name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input-dark"
              placeholder="Jane Smith"
            />
          </div>
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
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="input-dark"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
