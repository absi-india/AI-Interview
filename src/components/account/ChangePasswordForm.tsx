"use client";

import { useState } from "react";
import { showToast } from "@/components/ui/Toaster";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not change your password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password changed. Use it next time you sign in.", "success");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded-lg border border-[#dce2ea] bg-white px-3 py-2 text-sm text-[#0f172a]";

  return (
    <form onSubmit={submit} className="glass-card max-w-md p-6">
      <h1 className="text-[18px] font-semibold text-[#0f172a]">Change your password</h1>
      <p className="mt-1 text-sm text-[#64748b]">
        If you were sent a temporary password, set your own here. It takes effect the next time you sign in.
      </p>

      <label className="mt-5 block">
        <span className="text-[13px] font-medium text-[#334155]">Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className={field}
          required
        />
      </label>

      <label className="mt-4 block">
        <span className="text-[13px] font-medium text-[#334155]">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className={field}
          minLength={8}
          required
        />
        <span className="mt-1 block text-[11.5px] text-[#94a3b8]">At least 8 characters.</span>
      </label>

      <label className="mt-4 block">
        <span className="text-[13px] font-medium text-[#334155]">Confirm new password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={field}
          minLength={8}
          required
        />
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={saving} className="btn-primary mt-5 w-full disabled:opacity-60">
        {saving ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
