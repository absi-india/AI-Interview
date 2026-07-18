"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { showToast } from "@/components/ui/Toaster";

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
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/candidates/${candidateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const message =
          typeof data.error === "string" ? data.error : "Failed to delete candidate";
        showToast(message, "error");
        return;
      }

      showToast(`${candidateName} deleted`);
      setConfirming(false);
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
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={isDeleting}
        className={className}
        aria-label={`Delete ${candidateName}`}
      >
        Delete
      </button>
      <ConfirmDialog
        open={confirming}
        danger
        title="Delete Candidate"
        message={
          <>
            Delete <span className="font-medium text-[#0f172a]">{candidateName}</span>? All their
            tests and results will be permanently removed.
          </>
        }
        confirmLabel={isDeleting ? "Deleting…" : "Delete"}
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
