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
  inviteExpiresAt: string | null;
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
        className="flex w-full items-center justify-between bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#475569] hover:bg-[#f1f5f9] transition-colors border-b border-[#f0f2f6]"
      >
        <span>{label ?? "AI Conversation Log"}</span>
        <span className="font-mono text-xs text-[#94a3b8]">{open ? "hide" : "show"}</span>
      </button>

      {open && (
        <div className="p-4 flex flex-col gap-3">
          <div className="bg-[#f1f5f9] border-l-[3px] border-[#64748b] rounded-md p-3">
            <div className="mono-eyebrow text-[10.5px] !text-[#64748b] font-semibold mb-1.5">System Prompt</div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[#475569]">
              {debug.systemPrompt}
            </pre>
          </div>

          <div className="bg-[#eff4ff] border-l-[3px] border-[#2563eb] rounded-md p-3">
            <div className="mono-eyebrow text-[10.5px] !text-[#2563eb] font-semibold mb-1.5">User Prompt</div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[#3b5bbf]">
              {debug.userPrompt}
            </pre>
          </div>

          <div className="bg-[#f0fdf4] border-l-[3px] border-[#16a34a] rounded-md p-3">
            <div className="mono-eyebrow text-[10.5px] !text-[#16a34a] font-semibold mb-1.5">AI Response</div>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-[#15803d]">
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
  const [inviteValidityAmount, setInviteValidityAmount] = useState("7");
  const [inviteValidityUnit, setInviteValidityUnit] = useState<"minutes" | "hours" | "days">("days");
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
      body: JSON.stringify({
        edits,
        inviteValidityAmount: inviteValidityAmount.trim() || "1",
        inviteValidityUnit,
      }),
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

  if (!test) return <div className="p-8 text-[#64748b]">Loading...</div>;

  const isResendMode = test.status === "INVITED";
  const currentExpiry = test.inviteExpiresAt
    ? new Date(test.inviteExpiresAt).toLocaleString()
    : null;

  const levelColors: Record<string, string> = {
    BASIC: "bg-[#fef3c7] text-[#b45309]",
    INTERMEDIATE: "bg-[#dbeafe] text-[#2563eb]",
    ADVANCED: "bg-[#e0e7ff] text-[#4f46e5]",
    PRACTICAL: "bg-[#dcfce7] text-[#15803d]",
  };

  return (
    <div className="min-h-screen p-8" style={{ background: "#f4f6f9" }}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 animate-fade-in">
          <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="mb-6 rounded-2xl border border-[#dbe6ff] bg-[#eff4ff] p-4 animate-fade-in-up">
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-[#0f172a]">
              {test.candidate.name} — {test.jobTitle}
            </h1>
            <span className={`badge ${levelColors[test.level] ?? "bg-[#f1f5f9] text-[#64748b]"}`}>
              {test.level}
            </span>
          </div>
          <p className="text-sm text-[#3b5bbf]">
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
                  <span className="font-mono text-sm font-semibold text-[#2563eb]">Q{q.order}</span>
                  <span className="badge bg-[#f1f5f9] text-[#475569]">{q.category}</span>
                  {q.codeLanguageHint && (
                    <span className="badge bg-[#ede9fe] text-[#7c3aed]">Code: {q.codeLanguageHint}</span>
                  )}
                  {isEdited && (
                    <span className="badge bg-[#fef3c7] text-[#b45309]">Edited</span>
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
                    className="text-xs text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors"
                  >
                    {expandedSummaries[q.id] ? "Hide" : "Show"} expected answer summary
                  </button>
                  {expandedSummaries[q.id] && (
                    <p className="mt-2 rounded-lg bg-[#f0fdf4] border border-[#dcfce7] p-3 text-xs text-[#15803d]">
                      {q.expectedSummary}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        {inviteLink && (
          <p className="mb-4 text-sm text-[#b45309]">
            Manual invite link:{" "}
            <a href={inviteLink} className="break-all underline text-[#2563eb] hover:text-[#1d4ed8] transition-colors" target="_blank" rel="noreferrer">
              {inviteLink}
            </a>
          </p>
        )}

        <div className="mb-4 rounded-xl border border-[#e7ebf0] bg-white p-4">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[#0f172a]">Invite Link Validity</h2>
            <p className="mt-1 text-xs text-[#64748b]">
              Choose how long the candidate link should work after the invite is sent.
              {currentExpiry ? ` Current invite expires: ${currentExpiry}.` : ""}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#475569]">Duration</span>
              <input
                type="number"
                min={1}
                max={inviteValidityUnit === "days" ? 30 : inviteValidityUnit === "hours" ? 720 : 43200}
                value={inviteValidityAmount}
                onChange={(e) => setInviteValidityAmount(e.target.value)}
                onBlur={() => {
                  if (!inviteValidityAmount.trim() || Number(inviteValidityAmount) < 1) {
                    setInviteValidityAmount("1");
                  }
                }}
                className="input-dark"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[#475569]">Unit</span>
              <select
                value={inviteValidityUnit}
                onChange={(e) => setInviteValidityUnit(e.target.value as "minutes" | "hours" | "days")}
                className="input-dark"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </label>
          </div>
        </div>

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
