"use client";
import { signOut } from "next-auth/react";

const DEFAULT_CLASS =
  "h-[34px] px-3.5 rounded-lg border border-[#e0e6ee] bg-white text-sm text-[#475569] hover:bg-[#f8fafc] transition-colors duration-200 font-medium";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={className ?? DEFAULT_CLASS}
    >
      Sign out
    </button>
  );
}
