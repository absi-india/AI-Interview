"use client";
import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Candidate = { id: string; name: string; email: string; phone: string };

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

const LEVEL_CHOICES = [
  ...LEVELS,
  { value: "TRAINING", label: "TRAINING", desc: "Use your own practice questions", icon: "" },
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
  const [trainingQuestions, setTrainingQuestions] = useState("");
  const [trainingFileName, setTrainingFileName] = useState("");
  const [extractingTrainingFile, setExtractingTrainingFile] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<AiDebugInfo | null>(null);
  const [generatedTestId, setGeneratedTestId] = useState<string | null>(null);
  const trainingFileInputRef = useRef<HTMLInputElement>(null);
  const isTraining = level === "TRAINING";

  // Candidate dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Edit modal state
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete modal state
  const [deletingCandidate, setDeletingCandidate] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetch("/api/candidates")
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates ?? []));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleEditClick(c: Candidate) {
    setEditError("");
    setEditForm({ name: c.name, email: c.email, phone: c.phone ?? "" });
    setEditingCandidate(c);
    setDropdownOpen(false);
  }

  async function handleEditSave() {
    if (!editingCandidate) return;
    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.phone.trim()) {
      setEditError("Name, email and phone are required");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/candidates/${editingCandidate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json() as { candidate?: Candidate; error?: string };
      if (!res.ok) {
        setEditError(data.error ?? "Failed to update candidate");
        return;
      }
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === editingCandidate.id
            ? { ...c, name: data.candidate!.name, email: data.candidate!.email, phone: data.candidate!.phone }
            : c
        )
      );
      setEditingCandidate(null);
    } catch {
      setEditError("Network error. Please try again.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deletingCandidate) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/candidates/${deletingCandidate.id}`, { method: "DELETE" });
      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== deletingCandidate.id));
        if (candidateId === deletingCandidate.id) setCandidateId("");
        setDeletingCandidate(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidateId) { setError("Select a candidate"); return; }
    if (isTraining && !trainingQuestions.trim()) {
      setError("Paste or upload at least one training question");
      return;
    }
    setLoading(true);
    setError("");
    setDebug(null);
    setGeneratedTestId(null);

    try {
      const res = await fetch("/api/tests/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobTitle, jobDescription, level, trainingQuestions }),
      });
      const data = await readJsonResponse(res);

      if (!res.ok) {
        setError(data.error ?? "Failed to generate questions");
        return;
      }

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

  async function handleTrainingFile(file: File | null) {
    if (!file) return;
    setExtractingTrainingFile(true);
    setError("");
    setTrainingQuestions("");
    setTrainingFileName("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/tests/training-extract", {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse(res);

      if (!res.ok) {
        setError(data.error ?? "Could not read that file. Please paste the questions instead.");
        return;
      }

      setTrainingQuestions(typeof data.text === "string" ? data.text : "");
      setTrainingFileName(data.fileName ?? file.name);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not read that file";
      setError(`${message}. Please paste the questions instead.`);
    } finally {
      setExtractingTrainingFile(false);
    }
  }

  function clearTrainingFile() {
    setTrainingFileName("");
    setTrainingQuestions("");
    setError("");
    if (trainingFileInputRef.current) {
      trainingFileInputRef.current.value = "";
    }
  }

  const selectedCandidate = candidates.find((c) => c.id === candidateId);

  return (
    <>
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
            <p className="text-sm text-slate-400 mb-8">
              Generate questions from a JD or use Training to provide your own practice questions without AI token usage.
            </p>

            {!generatedTestId ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Custom Candidate Picker */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Candidate *</label>
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setDropdownOpen((v) => !v)}
                      className="input-dark w-full text-left flex items-center justify-between"
                    >
                      <span className={selectedCandidate ? "text-white" : "text-slate-500"}>
                        {selectedCandidate ? selectedCandidate.name : "Select candidate…"}
                      </span>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {dropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-40 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-sm shadow-2xl overflow-hidden">
                        <div className="max-h-60 overflow-y-auto">
                          {candidates.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-slate-500">No candidates yet</p>
                          ) : (
                            candidates.map((c) => (
                              <div
                                key={c.id}
                                className={`group flex items-center gap-2 px-3 py-2.5 transition-colors ${
                                  candidateId === c.id ? "bg-blue-500/10" : "hover:bg-white/5"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => { setCandidateId(c.id); setDropdownOpen(false); }}
                                  className="flex-1 text-left min-w-0"
                                >
                                  <span className="block text-sm font-medium text-white truncate">{c.name}</span>
                                  <span className="block text-xs text-slate-400 truncate">{c.email}</span>
                                </button>
                                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleEditClick(c); }}
                                    className="p-1.5 rounded-lg hover:bg-blue-500/20 text-slate-400 hover:text-blue-300 transition-colors"
                                    title="Edit candidate"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setDeletingCandidate({ id: c.id, name: c.name }); setDropdownOpen(false); }}
                                    className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors"
                                    title="Delete candidate"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="border-t border-white/5">
                          <Link
                            href="/candidates/new"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-2 px-3 py-2.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-white/5 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                            Add new candidate
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    {isTraining ? "Session Name" : "Job Title *"}
                  </label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    required={!isTraining}
                    placeholder={isTraining ? "Optional: Python practice, mock round, training batch..." : "e.g. Senior React Engineer"}
                    className="input-dark"
                  />
                </div>

                {!isTraining && (
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
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Interview Level *</label>
                  <div className="grid grid-cols-2 gap-3">
                    {LEVEL_CHOICES.map((l) => (
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
                          <div className="font-medium text-sm text-white flex items-center gap-2">
                            {l.icon && <span>{l.icon}</span>}
                            <span>{l.label}</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{l.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {isTraining && (
                  <div className="space-y-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                    <div>
                      <label className="block text-sm font-medium text-cyan-200 mb-1">Training Questions *</label>
                      <p className="text-xs text-slate-400 mb-3">
                        Paste one question per line, or upload PDF, DOCX, TXT, MD, or CSV. These questions are saved directly without AI generation.
                      </p>
                      <textarea
                        value={trainingQuestions}
                        onChange={(e) => setTrainingQuestions(e.target.value)}
                        required={isTraining}
                        rows={8}
                        placeholder={"1. Explain Python list comprehensions.\n2. What is the difference between a tuple and a list?\n3. How would you debug a slow API?"}
                        className="input-dark"
                      />
                    </div>
                    <div>
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/10 bg-slate-800/60 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700/70">
                        Upload Questions File
                        <input
                          ref={trainingFileInputRef}
                          type="file"
                          accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
                          onChange={(e) => handleTrainingFile(e.target.files?.[0] ?? null)}
                          className="sr-only"
                        />
                      </label>
                      {extractingTrainingFile && (
                        <span className="ml-3 text-xs text-cyan-300">Reading file...</span>
                      )}
                      {trainingFileName && (
                        <span className="ml-3 inline-flex items-center gap-2 text-xs text-cyan-300">
                          Loaded {trainingFileName}
                          <button
                            type="button"
                            onClick={clearTrainingFile}
                            className="rounded-md border border-red-400/25 bg-red-500/10 px-2 py-1 font-medium text-red-300 transition-colors hover:bg-red-500/20"
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full py-3"
                >
                  {loading
                    ? isTraining ? "Creating training questions..." : "Generating questions with AI..."
                    : isTraining ? "Create Training Questions" : "Generate Questions"}
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
                  Review &amp; Edit Questions →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 max-w-md w-full animate-fade-in-up">
            <h3 className="text-white font-semibold text-lg mb-1">Edit Candidate</h3>
            <p className="text-xs text-slate-500 mb-5">Changes apply immediately.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-dark"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="input-dark"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone *</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="input-dark"
                  placeholder="+91 98765 43210"
                />
              </div>
              {editError && <p className="text-sm text-red-400">{editError}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleEditSave}
                  disabled={editLoading}
                  className="btn-primary"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Candidate Confirmation Modal */}
      {deletingCandidate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card p-6 max-w-sm w-full animate-fade-in-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold">Delete Candidate</h3>
                <p className="text-xs text-slate-500">This cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-5">
              Delete <span className="text-white font-medium">{deletingCandidate.name}</span>? All their tests and results will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
                className="flex-1 rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setDeletingCandidate(null)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ScheduleTestPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
      <ScheduleTestForm />
    </Suspense>
  );
}
