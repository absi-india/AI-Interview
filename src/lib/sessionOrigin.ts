import "server-only";

/**
 * Where an interview was taken from.
 *
 * Recorded for interview integrity, alongside the existing tab-switch and
 * fullscreen tracking: it shows whether a candidate sat the interview from the
 * location they claim, and surfaces two people sitting different interviews
 * from one address. Geolocation comes from the edge headers the platform
 * already attaches, so nothing is sent to a third party and the interview is
 * not slowed down.
 *
 * IP geolocation is approximate — typically the right city, sometimes only the
 * right region, and a VPN will report wherever it exits. Treat it as a signal
 * to look into, never as proof on its own.
 */

/** Event type used to store this on the existing fraud-event table. */
export const SESSION_ORIGIN_EVENT = "SESSION_ORIGIN";

export interface SessionOrigin {
  ip: string;
  city: string;
  region: string;
  country: string;
  timezone: string;
}

function firstHeader(headers: Headers, name: string): string {
  const raw = headers.get(name);
  if (!raw) return "";
  // x-forwarded-for is a chain; the client is the first entry.
  return raw.split(",")[0]?.trim() ?? "";
}

function decode(value: string): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readSessionOrigin(headers: Headers): SessionOrigin {
  return {
    ip: firstHeader(headers, "x-forwarded-for") || firstHeader(headers, "x-real-ip"),
    city: decode(firstHeader(headers, "x-vercel-ip-city")),
    region: decode(firstHeader(headers, "x-vercel-ip-country-region")),
    country: decode(firstHeader(headers, "x-vercel-ip-country")),
    timezone: decode(firstHeader(headers, "x-vercel-ip-timezone")),
  };
}

/** One readable line, stored in the event's detail field. */
export function formatSessionOrigin(origin: SessionOrigin): string {
  const place = [origin.city, origin.region, origin.country].filter(Boolean).join(", ");
  const parts = [
    origin.ip ? `IP ${origin.ip}` : "IP unavailable",
    place || "Location unavailable",
    origin.timezone ? `Timezone ${origin.timezone}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function hasAnySessionOrigin(origin: SessionOrigin): boolean {
  return Boolean(origin.ip || origin.city || origin.country);
}
