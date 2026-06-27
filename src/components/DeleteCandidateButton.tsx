"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type DeleteCandidateButtonProps = {
  candidateId: string;
  candidateName: string;
  className?: string;
  redirectTo?: string;
};

export function DeleteCandidateButton({
  candidateId,
  candidateName,
  className = "text-[#dc2626] hover:text-[#b91c1c] transition-colors disabled:text-[#cbd5e1] disabled:no-underline text-sm font-medium",
  redirectTo,
}: DeleteCandidateButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${candidateName}? This will also remove their tests and results.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message =
          typeof data.error === "string" ? data.error : "Failed to delete candidate";
        window.alert(message);
        return;
      }

      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className={className}
      aria-label={`Delete ${candidateName}`}
    >
      {isDeleting ? "Deleting..." : "Delete"}
    </button>
  );
}
