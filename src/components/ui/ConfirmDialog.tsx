"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={loading ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="glass-card w-full max-w-sm p-6 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
              danger ? "bg-[#fee2e2]" : "bg-[#dbeafe]"
            }`}
          >
            {danger ? (
              <svg className="h-5 w-5 text-[#dc2626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-[#0f172a]">{title}</h3>
            {danger && <p className="text-xs text-[#64748b]">This cannot be undone</p>}
          </div>
        </div>
        <div className="mb-5 text-sm text-[#475569]">{message}</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              danger
                ? "flex-1 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-semibold text-[#dc2626] transition-colors hover:bg-[#fee2e2] disabled:opacity-50"
                : "btn-primary flex-1"
            }
          >
            {loading ? "Working…" : confirmLabel}
          </button>
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary flex-1">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
