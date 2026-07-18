"use client";

import { useEffect, useState } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; message: string; type: ToastType };

/** Fire a toast from any client component: showToast("Invite sent") */
export function showToast(message: string, type: ToastType = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app:toast", { detail: { message, type } }));
}

const TYPE_STYLE: Record<ToastType, { icon: string; iconClass: string }> = {
  success: { icon: "✓", iconClass: "bg-emerald-500/15 text-emerald-400" },
  error: { icon: "✕", iconClass: "bg-red-500/15 text-red-400" },
  info: { icon: "i", iconClass: "bg-blue-500/15 text-blue-400" },
};

let nextToastId = 1;

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message?: string; type?: ToastType } | undefined;
      if (!detail?.message) return;
      const id = nextToastId++;
      setToasts((t) => [...t, { id, message: detail.message!, type: detail.type ?? "success" }]);
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 3800);
    };
    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="animate-toast-in pointer-events-auto flex items-center gap-3 rounded-xl bg-[#0f172a] pl-3.5 pr-5 py-3 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.5)]"
        >
          <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] font-bold ${TYPE_STYLE[t.type].iconClass}`}>
            {TYPE_STYLE[t.type].icon}
          </span>
          <span className="text-[13px] font-medium text-white">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
