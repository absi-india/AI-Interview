"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Question = {
  id: string;
  order: number;
  questionText: string;
  category: string;
  expectedSummary: string;
  codeLanguageHint: string | null;
};

type Test = {
  id: string;
  jobTitle: string;
  level: string;
  status: string;
  candidate: { name: string };
  questions: Question[];
};

interface AiDebugInfo {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
}

function AiConversationPanel({ debug, label }: { debug: AiDebugInfo; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden glass-card">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-violet-500/5 px-4 py-3 text-sm font-medium text-violet-300 hover:bg-violet-500/10 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          {label ?? "AI Conversation Log"}
        </span>
        <span className="text-xs text-violet-400">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="divide-y divide-white/5">
          <div className="bg-slate-800/30 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">System Prompt</span>
              <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-xs text-slate-400">instructions sent to AI</span>
            </div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-slate-900/50 p-3 font-mono text-xs text-slate-300">
              {debug.systemPrompt}
            </pre>
          </div>

          <div className="bg-blue-500/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-blue-400">User Prompt</span>
              <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-300">job details</span>
            </div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-blue-500/10 bg-slate-900/50 p-3 font-mono text-xs text-blue-200">
              {debug.userPrompt}
            </pre>
          </div>

          <div className="bg-emerald-500/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-emerald-400">AI Response</span>
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">raw output</span>
            </div>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-emerald-500/10 bg-slate-900/50 p-3 font-mono text-xs text-emerald-200">
              {debug.rawResponse}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReviewQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [test, setTest] = useState<Test | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [expandedSummaries, setExpandedSummaries] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [debug] = useState<AiDebugInfo | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = sessionStorage.getItem(`ai_debug_${id}`);
      return stored ? (JSON.parse(stored) as AiDebugInfo) : null;
    } catch {
      return null;
    }
  });
  const [regenDebug, setRegenDebug] = useState<AiDebugInfo | null>(null);

  useEffect(() => {
    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setTest(d.test);
        const initial: Record<string, string> = {};
        d.test?.questions?.forEach((q: Question) => {
          initial[q.id] = q.questionText;
        });
        setEdits(initial);
      });
  }, [id]);

  async function handleApprove() {
    setLoading(true);
    setError("");
    setInviteLink("");

    const res = await fetch(`/api/tests/${id}/approve-and-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Failed to send invite");
      if (typeof data.inviteLink === "string") setInviteLink(data.inviteLink);
      return;
    }

    router.push(`/tests/${id}?invite=${isResendMode ? "resent" : "sent"}`);
  }

  async function handleRegenerate() {
    if (!confirm("This will replace all current questions. Continue?")) return;
    setRegenerating(true);
    setError("");
    setRegenDebug(null);

    const res = await fetch(`/api/tests/${id}/regenerate`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Failed to regenerate");
      setRegenerating(false);
      return;
    }

    if (data.debug) setRegenDebug(data.debug);

    fetch(`/api/tests/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setTest(d.test);
        const initial: Record<string, string> = {};
        d.test?.questions?.forEach((q: Question) => {
          initial[q.id] = q.questionText;
        });
        setEdits(initial);
        setRegenerating(false);
      });
  }

  if (!test) return <div className="p-8 text-slate-500">Loading...</div>;

  const isResendMode = test.status === "INVITED";

  const levelColors: Record<string, string> = {
    BASIC: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
    INTERMEDIATE: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
    ADVANCED: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
    PRACTICAL: "bg-violet-500/15 text-violet-300 border border-violet-500/20",
  };

  return (
    <div className="min-h-screen p-8" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 animate-fade-in">
          <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="mb-6 glass-card p-4 bg-blue-500/5 border-blue-500/15 animate-fade-in-up">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">
              {test.candidate.name} — {test.jobTitle}
            </h1>
            <span className={`badge ${levelColors[test.level] ?? "bg-slate-500/15 text-slate-400"}`}>
              {test.level}
            </span>
          </div>
          <p className="text-sm text-blue-300/70">
            {isResendMode
              ? "This test is already invited. You can edit questions if needed and resend the invite email."
              : "Review the AI-generated questions below. You can edit any question before sending the invite email."}
          </p>
        </div>

        {(debug || regenDebug) && (
          <div className="mb-6 space-y-3">
            {debug && <AiConversationPanel debug={debug} label="Original AI Generation" />}
            {regenDebug && <AiConversationPanel debug={regenDebug} label="Regeneration AI Conversation" />}
          </div>
        )}

        <div className="mb-8 space-y-4 stagger">
          {test.questions.map((q) => {
            const isEdited = edits[q.id] !== q.questionText;
            return (
              <div key={q.id} className="glass-card p-5 animate-fade-in-up">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-500">Q{q.order}</span>
                  <span className="badge bg-slate-700/50 text-slate-400 border border-white/5">{q.category}</span>
                  {q.codeLanguageHint && (
                    <span className="badge bg-violet-500/15 text-violet-300 border border-violet-500/20">Code: {q.codeLanguageHint}</span>
                  )}
                  {isEdited && (
                    <span className="badge bg-amber-500/15 text-amber-300 border border-amber-500/20">Edited</span>
                  )}
                </div>
                <textarea
                  value={edits[q.id] ?? q.questionText}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  rows={3}
                  className="input-dark resize-none"
                />
                <div className="mt-2">
                  <button
                    onClick={() => setExpandedSummaries((p) => ({ ...p, [q.id]: !p[q.id] }))}
                    className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                  >
                    {expandedSummaries[q.id] ? "Hide" : "Show"} expected answer summary
                  </button>
                  {expandedSummaries[q.id] && (
                    <p className="mt-2 rounded-lg bg-slate-800/50 border border-white/5 p-3 text-xs text-slate-400">
                      {q.expectedSummary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        {inviteLink && (
          <p className="mb-4 text-sm text-amber-300">
            Manual invite link:{" "}
            <a href={inviteLink} className="break-all underline text-blue-400 hover:text-blue-300 transition-colors" target="_blank" rel="noreferrer">
              {inviteLink}
            </a>
          </p>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleApprove}
            disabled={loading || regenerating}
            className="btn-primary flex-1 py-3"
          >
            {loading
              ? isResendMode
                ? "Resending invite..."
                : "Sending invite..."
              : isResendMode
                ? "Resend Invite Email"
                : "Approve & Send Invite"}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={loading || regenerating}
            className="btn-secondary px-6 py-3"
          >
            {regenerating ? "Regenerating..." : "Regenerate All Questions"}
          </button>
        </div>
      </div>
    </div>
  );
}
