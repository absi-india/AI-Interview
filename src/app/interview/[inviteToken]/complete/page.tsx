"use client";

import { useEffect } from "react";
import { use } from "react";

export default function CompletePage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = use(params);

  useEffect(() => {
    fetch(`/api/interview/${inviteToken}/rate`, { method: "POST" }).catch(() => {
      // best-effort — cron will catch it if this fails
    });
  }, [inviteToken]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
      <div className="glass-card p-12 max-w-lg text-center animate-fade-in-up">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 mb-6 shadow-lg" style={{ boxShadow: "0 8px 32px rgba(16,185,129,0.3)" }}>
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Interview Submitted!</h1>
        <p className="text-slate-400">
          Thank you! Your interview has been submitted successfully. The recruiter will review your responses and be in touch soon.
        </p>
        <div className="mt-6 pt-6 border-t border-white/5">
          <p className="text-xs text-slate-600">Powered by <span className="text-gradient font-semibold">ABSI</span></p>
        </div>
      </div>
    </div>
  );
}
