import type { NextAuthConfig } from "next-auth";

function isLocalDevHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function isPrivateIPv4(hostname: string) {
  if (hostname.startsWith("10.")) return true;
  if (hostname.startsWith("192.168.")) return true;

  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function normalizeDevBaseUrl(baseUrl: string) {
  if (process.env.NODE_ENV === "production") return baseUrl;

  try {
    const url = new URL(baseUrl);
    if (url.hostname === "0.0.0.0") {
      url.hostname = "localhost";
      return url.origin;
    }
  } catch {
    // Invalid baseUrl falls through unchanged.
  }

  return baseUrl;
}

export const authConfig = {
  providers: [],
  callbacks: {
    redirect({ url, baseUrl }) {
      const safeBaseUrl = normalizeDevBaseUrl(baseUrl);
      if (url.startsWith("/")) return `${safeBaseUrl}${url}`;

      try {
        const target = new URL(url);
        const base = new URL(safeBaseUrl);

        if (target.origin === base.origin) return url;

        // Local development convenience:
        // allow redirects between localhost and private LAN hosts.
        if (
          process.env.NODE_ENV !== "production" &&
          isLocalDevHost(base.hostname) &&
          (isLocalDevHost(target.hostname) || isPrivateIPv4(target.hostname))
        ) {
          return url;
        }
      } catch {
        // Invalid URL falls back to baseUrl.
      }

      return safeBaseUrl;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.email === "string") session.user.email = token.email;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
} satisfies NextAuthConfig;
