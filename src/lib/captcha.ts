import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Cloudflare Turnstile, wired so that it can only ever *add* a check.
 *
 * Every entry point treats "not configured" as "no captcha", so the sign-in
 * page keeps working exactly as it does today until both keys are present.
 * Both keys are read on the server and the site key is handed to the browser
 * at runtime (see the /api/auth/captcha route) rather than baked into the
 * bundle: that way the widget and the server-side check can never disagree
 * about whether the captcha is on, which is the one way this could lock
 * everybody out.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** How long a solved captcha stays good for. Long enough to finish typing. */
const PROOF_TTL_MS = 15 * 60 * 1000;

export function captchaSiteKey(): string | undefined {
  return process.env.TURNSTILE_SITE_KEY?.trim() || undefined;
}

function captchaSecretKey(): string | undefined {
  return process.env.TURNSTILE_SECRET_KEY?.trim() || undefined;
}

/**
 * Both keys, or nothing. A secret without a site key would mean the widget
 * never renders while the server demands a proof — nobody could sign in.
 */
export function captchaEnabled(): boolean {
  return Boolean(captchaSiteKey() && captchaSecretKey());
}

function proofSecret(): string {
  return (
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    captchaSecretKey() ??
    "captcha-proof-fallback"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", proofSecret()).update(payload).digest("hex");
}

/**
 * A solved captcha, restated as something we can check more than once.
 *
 * Turnstile tokens are single-use, but one sign-in attempt calls the
 * credentials provider twice (Firebase first, then the bcrypt fallback), so
 * handing the raw token to both would fail the second call and reject a
 * correct password. Instead the token is spent once, here, for a signed
 * statement that stays valid for its short lifetime.
 */
export function issueCaptchaProof(): string {
  const expiresAt = Date.now() + PROOF_TTL_MS;
  const payload = `${expiresAt}.${randomBytes(9).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyCaptchaProof(proof: unknown): boolean {
  if (typeof proof !== "string" || !proof) return false;

  const lastDot = proof.lastIndexOf(".");
  if (lastDot < 0) return false;

  const payload = proof.slice(0, lastDot);
  const presented = proof.slice(lastDot + 1);
  const expected = sign(payload);

  if (presented.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) return false;

  const expiresAt = Number(payload.split(".")[0]);
  return Number.isFinite(expiresAt) && Date.now() < expiresAt;
}

/** Ask Cloudflare whether this token is a real, unspent solve. */
export async function verifyTurnstileToken(
  token: unknown,
  remoteIp?: string,
): Promise<{ ok: boolean; error?: string }> {
  const secret = captchaSecretKey();
  if (!secret) return { ok: true };
  if (typeof token !== "string" || !token) {
    return { ok: false, error: "Please complete the verification below." };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let data: { success?: boolean; "error-codes"?: string[] };
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    data = await res.json();
  } catch {
    // Cloudflare unreachable. Refusing here would take sign-in down with it,
    // so the attempt is allowed through and the password still has to be right.
    return { ok: true };
  }

  if (data.success) return { ok: true };

  const codes = data["error-codes"] ?? [];
  if (codes.includes("timeout-or-duplicate")) {
    return { ok: false, error: "That verification expired. Please try again." };
  }
  return { ok: false, error: "Verification failed. Please try again." };
}
