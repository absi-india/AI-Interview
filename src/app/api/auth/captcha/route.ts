import { NextRequest, NextResponse } from "next/server";
import {
  captchaEnabled,
  captchaSiteKey,
  issueCaptchaProof,
  verifyTurnstileToken,
} from "@/lib/captcha";
import { readSessionOrigin } from "@/lib/sessionOrigin";

/**
 * Whether to show the widget, and which site key to draw it with.
 *
 * The sign-in page asks at load time instead of reading a build-time value,
 * so turning the captcha on or off in the hosting environment takes effect on
 * the next page load and the browser can never disagree with the server about
 * whether a proof is required.
 */
export async function GET() {
  return NextResponse.json(
    { enabled: captchaEnabled(), siteKey: captchaEnabled() ? captchaSiteKey() : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Spend a solved Turnstile token for a short-lived proof. */
export async function POST(req: NextRequest) {
  if (!captchaEnabled()) return NextResponse.json({ proof: null });

  const body = await req.json().catch(() => null);
  const { ok, error } = await verifyTurnstileToken(
    (body as { token?: unknown } | null)?.token,
    readSessionOrigin(req.headers).ip,
  );

  if (!ok) return NextResponse.json({ error }, { status: 400 });
  return NextResponse.json({ proof: issueCaptchaProof() });
}
