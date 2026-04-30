"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Candidate = { id: string; name: string; email: string };

interface AiDebugInfo {
  systemPrompt: string;
  userPrompt: string;
  rawResponse: string;
}

async function readJsonResponse(res: Response) {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const compactText = text.replace(/\s+/g, " ").trim().slice(0, 180);
    return {
      error: compactText
        ? `Server returned a non-JSON response: ${compactText}`
        : "Server returned a non-JSON response",
    };
  }
}

const LEVELS = [
  { value: "BASIC", label: "Basic", desc: "Definitions, fundamentals, conceptual", icon: "📘" },
  { value: "INTERMEDIATE", label: "Intermediate", desc: "Applied knowledge, scenario-based", icon: "📗" },
  { value: "ADVANCED", label: "Advanced", desc: "Architecture, system design, edge cases", icon: "📕" },
  { value: "PRACTICAL", label: "Practical", desc: "Live hands-on coding / implementation", icon: "💻" },
];

function AiConversationPanel({ debug }: { debug: AiDebugInfo }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 glass-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-violet-500/5 text-sm font-medium text-violet-300 hover:bg-violet-500/10 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">🤖</span> AI Conversation Log
        </span>
        <span className="text-violet-400 text-xs">{open ? "▲ hide" : "▼ show"}</span>
      </button>

      {open && (
        <div className="divide-y divide-white/5">
          <div className="p-4 bg-slate-800/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">System Prompt</span>
              <span className="text-xs px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded">sent to AI</span>
            </div>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50 border border-white/5 rounded-lg p-3 max-h-48 overflow-y-auto">
              {debug.systemPrompt}
            </pre>
          </div>

          <div className="p-4 bg-blue-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">User Prompt</span>
              <span className="text-xs px-1.5 py-0.5 bg-blue-500/15 text-blue-300 rounded">job details</span>
            </div>
            <pre className="text-xs text-blue-200 whitespace-pre-wrap font-mono bg-slate-900/50 border border-blue-500/10 rounded-lg p-3 max-h-48 overflow-y-auto">
              {debug.userPrompt}
            </pre>
          </div>

          <div className="p-4 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">AI Response</span>
              <span className="text-xs px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 rounded">raw output</span>
            </div>
            <pre className="text-xs text-emerald-200 whitespace-pre-wrap font-mono bg-slate-900/50 border border-emerald-500/10 rounded-lg p-3 max-h-64 overflow-y-auto">
              {debug.rawResponse}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleTestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("candidateId") ?? "";

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState(preselectedId);
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [level, setLevel] = useState("BASIC");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<AiDebugInfo | null>(null);
  const [generatedTestId, setGeneratedTestId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/candidates")
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates ?? []));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateId) { setError("Select a candidate"); return; }
    setLoading(true);
    setError("");
    setDebug(null);
    setGeneratedTestId(null);

    try {
      const res = await fetch("/api/tests/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobTitle, jobDescription, level }),
      });
      const data = await readJsonResponse(res);

      if (!res.ok) {
        setError(data.error ?? "Failed to generate questions");
        return;
      }

      // Store debug info so review-questions page can display it
      if (data.debug) {
        setDebug(data.debug);
        setGeneratedTestId(data.testId);
        try {
          sessionStorage.setItem(`ai_debug_${data.testId}`, JSON.stringify(data.debug));
        } catch {
          // sessionStorage not available (e.g., private browsing)
        }
      } else {
        router.push(`/tests/${data.testId}/review-questions`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network request failed";
      setError(`Failed to generate questions: ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 animate-fade-in">
          <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Dashboard
          </Link>
        </div>
        <div className="glass-card p-8 animate-fade-in-up">
          <h1 className="text-xl font-bold text-white mb-2">Schedule Technical Interview</h1>
          <p className="text-sm text-slate-400 mb-8">AI will generate 10 questions based on the job description. You can review and edit before sending the invite.</p>

          {!generatedTestId ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Candidate *</label>
                <select
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  required
                  className="input-dark"
                >
                  <option value="">Select candidate…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Job Title *</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  placeholder="e.g. Senior React Engineer"
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Job Description *</label>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  required
                  rows={8}
                  placeholder="Paste the full job description here. The AI will use this to generate targeted questions…"
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Interview Level *</label>
                <div className="grid grid-cols-2 gap-3">
                  {LEVELS.map((l) => (
                    <label
                      key={l.value}
                      className={`flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${
                        level === l.value
                          ? "border-blue-500/40 bg-blue-500/10 shadow-md"
                          : "border-white/5 bg-slate-800/30 hover:bg-slate-800/50 hover:border-white/10"
                      }`}
                    >
                      <input
                        type="radio"
                        name="level"
                        value={l.value}
                        checked={level === l.value}
                        onChange={() => setLevel(l.value)}
                        className="mt-1 accent-blue-500"
                      />
                      <div>
                        <div className="font-medium text-sm text-white flex items-center gap-2">{l.icon} {l.label}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{l.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3"
              >
                {loading ? "Generating questions with AI…" : "Generate Questions"}
              </button>
            </form>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold text-emerald-300">10 questions generated!</p>
                  <p className="text-sm text-emerald-400/70">Review the AI conversation below, then proceed to review questions.</p>
                </div>
              </div>

              {debug && <AiConversationPanel debug={debug} />}

              <button
                onClick={() => router.push(`/tests/${generatedTestId}/review-questions`)}
                className="btn-primary w-full py-3"
              >
                Review & Edit Questions →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScheduleTestPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
      <ScheduleTestForm />
    </Suspense>
  );
}
