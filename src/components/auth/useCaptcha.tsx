"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The Turnstile checkbox on the sign-in and registration forms.
 *
 * Whether there is a captcha at all is decided by the server and fetched at
 * load time, so a half-finished setup shows no widget rather than a form
 * nobody can submit. Until that answer arrives — or if it never does — the
 * form behaves exactly as it did before the captcha existed.
 */

/**
 * Turnstile publishes its global asynchronously, *after* the script element's
 * own load event, so waiting on that event hands back a script that has not
 * defined `turnstile` yet. The documented signal is this callback.
 */
const READY_CALLBACK = "__tipTurnstileReady";
const SCRIPT_URL = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${READY_CALLBACK}`;

/** Give up rather than leave the sign-in button permanently unusable. */
const LOAD_TIMEOUT_MS = 15000;

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve) => {
    let settled = false;
    const finish = (api: TurnstileApi | null) => {
      if (settled) return;
      settled = true;
      resolve(api);
    };

    const w = window as unknown as Record<string, unknown>;
    w[READY_CALLBACK] = () => finish(window.turnstile ?? null);

    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    // Blocked, offline, or simply slow: resolve empty rather than hang.
    script.onerror = () => finish(null);
    setTimeout(() => finish(window.turnstile ?? null), LOAD_TIMEOUT_MS);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface CaptchaResult {
  ok: boolean;
  proof?: string | null;
  error?: string;
}

export function useCaptcha() {
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/captcha")
      .then((res) => res.json())
      .then((data: { enabled?: boolean; siteKey?: string | null }) => {
        if (!cancelled && data?.enabled && data.siteKey) setSiteKey(data.siteKey);
      })
      // Unreachable endpoint means no captcha rather than no sign-in.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstile().then((turnstile) => {
      if (cancelled) return;
      if (!turnstile) {
        // Nothing to solve, and the server will still want a proof. Say so,
        // rather than leaving a button that silently refuses to work.
        setUnavailable(true);
        return;
      }
      if (!containerRef.current) return;
      if (widgetIdRef.current) return; // Strict mode mounts twice.

      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        callback: (t: string) => {
          setToken(t);
          setError("");
        },
        "expired-callback": () => setToken(null),
        "error-callback": () => setToken(null),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [siteKey]);

  const reset = useCallback(() => {
    setToken(null);
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, []);

  /**
   * Trade the solved checkbox for a proof the sign-in call can present.
   * Returns a pass when there is no captcha configured.
   */
  const getProof = useCallback(async (): Promise<CaptchaResult> => {
    if (!siteKey) return { ok: true, proof: null };
    if (!token) {
      const message = unavailable
        ? "The verification service could not be loaded. Check your connection and refresh."
        : "Please complete the verification below.";
      setError(message);
      return { ok: false, error: message };
    }

    try {
      const res = await fetch("/api/auth/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => null)) as
        | { proof?: string; error?: string }
        | null;

      if (!res.ok || !data?.proof) {
        const message = data?.error ?? "Verification failed. Please try again.";
        setError(message);
        reset();
        return { ok: false, error: message };
      }

      // The token is spent now; re-arm so a retry has a fresh one.
      reset();
      return { ok: true, proof: data.proof };
    } catch {
      setError("Could not reach the verification service.");
      return { ok: false, error: "Could not reach the verification service." };
    }
  }, [siteKey, token, reset, unavailable]);

  const element = siteKey ? (
    <div className="space-y-1.5">
      <div ref={containerRef} className="flex justify-center" />
      {error && <p className="text-red-600 text-sm text-center">{error}</p>}
    </div>
  ) : null;

  return { required: Boolean(siteKey), element, getProof, reset };
}
