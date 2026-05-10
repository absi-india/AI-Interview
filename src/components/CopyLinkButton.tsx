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
      className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
