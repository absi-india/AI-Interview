"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm text-slate-400 hover:text-red-400 transition-colors duration-200 font-medium"
    >
      Sign out
    </button>
  );
}
