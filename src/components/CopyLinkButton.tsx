"use client";

import { useState } from "react";

export function CopyLinkButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={copyLink}
      className="text-[#64748b] hover:text-[#2563eb] font-medium transition-colors"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
