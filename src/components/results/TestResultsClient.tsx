"use client";
import { useState } from "react";

type Question = {
  id: string;
  order: number;
  questionText: string;
  category: string;
  transcript: string | null;
  codeResponse: string | null;
  videoUrl: string | null;
  aiScore: number | null;
  aiRationale: string | null;
};

type FraudEvent = {
  id: string;
  type: string;
  severity: string;
  detail: string;
  occurredAt: string;
};

type Test = {
  id: string;
  jobTitle: string;
  level: string;
  status: string;
  overallScore: number | null;
  overallRating: string | null;
  startedAt: string | null;
  completedAt: string | null;
  timeUsedSeconds: number | null;
  candidate: { name: string; email: string };
  questions: Question[];
  fraudEvents: FraudEvent[];
};

const SCORE_COLOR: Record<string, string> = {
  Excellent: "text-emerald-400",
  Good: "text-blue-400",
  Average: "text-amber-400",
  "Below Average": "text-orange-400",
  Poor: "text-red-400",
};

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "text-red-400 bg-red-500/10 border border-red-500/15",
  MEDIUM: "text-amber-400 bg-amber-500/10 border border-amber-500/15",
  LOW: "text-yellow-400 bg-yellow-500/10 border border-yellow-500/15",
};

export function TestResultsClient({ test, shareUrl }: { test: Test; shareUrl?: string }) {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fraudOpen, setFraudOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  function copyShare() {
    if (shareUrl) navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const highCount = test.fraudEvents.filter((e) => e.severity === "HIGH").length;
  const mediumCount = test.fraudEvents.filter((e) => e.severity === "MEDIUM").length;
  const lowCount = test.fraudEvents.filter((e) => e.severity === "LOW").length;

  const scoreColor = SCORE_COLOR[test.overallRating ?? ""] ?? "text-white";
  const candidateVideos = test.questions.filter((q) => q.videoUrl);
  const selectedVideo = candidateVideos.find((q) => q.id === selectedVideoId) ?? candidateVideos[0];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="glass-card p-6 mb-6 animate-fade-in-up">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-white">{test.candidate.name}</h1>
            <p className="text-slate-400">{test.jobTitle} • {test.level}</p>
            <p className="text-sm text-slate-500 mt-1">
              {test.completedAt ? `Completed ${new Date(test.completedAt).toLocaleString()}` : `Status: ${test.status}`}
              {test.timeUsedSeconds ? ` • ${Math.floor(test.timeUsedSeconds / 60)}m ${test.timeUsedSeconds % 60}s` : ""}
            </p>
          </div>
          <div className="text-right">
            {test.overallScore !== null ? (
              <>
                <div className={`text-5xl font-bold ${scoreColor}`} style={{ textShadow: "0 0 20px currentColor" }}>{test.overallScore.toFixed(1)}</div>
                <div className="text-sm text-slate-500">/ 10</div>
                <div className={`text-sm font-medium mt-1 ${scoreColor}`}>{test.overallRating}</div>
              </>
            ) : (
              <div className="text-slate-500 text-sm">
                {test.status === "COMPLETED" ? "Rating in progress…" : test.status.replace(/_/g, " ")}
              </div>
            )}
          </div>
        </div>
        {shareUrl && (
          <button
            onClick={copyShare}
            className="btn-secondary mt-4 text-sm"
          >
            {copied ? "✓ Copied!" : "Copy Share Link"}
          </button>
        )}
      </div>

      {/* Fraud summary */}
      {test.fraudEvents.length > 0 && (
        <div className="glass-card p-6 mb-6 animate-fade-in-up">
          <button
            className="w-full flex justify-between items-center text-left"
            onClick={() => setFraudOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold text-white">Interview Integrity Report</h2>
            <div className="flex gap-3 text-sm">
              {highCount > 0 && <span className="text-red-400 font-medium">HIGH: {highCount}</span>}
              {mediumCount > 0 && <span className="text-amber-400 font-medium">MEDIUM: {mediumCount}</span>}
              {lowCount > 0 && <span className="text-yellow-400 font-medium">LOW: {lowCount}</span>}
              <span className="text-slate-500">{fraudOpen ? "▲" : "▼"}</span>
            </div>
          </button>
          {fraudOpen && (
            <div className="mt-4 space-y-2 animate-fade-in">
              {test.fraudEvents.map((e) => (
                <div key={e.id} className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm ${SEVERITY_COLOR[e.severity] ?? "bg-slate-800/50"}`}>
                  <div>
                    <span className="font-medium">{e.type.replace(/_/g, " ")}</span>
                    {e.detail && <span className="ml-2 text-xs opacity-70">{e.detail}</span>}
                  </div>
                  <span className="text-xs opacity-70">{new Date(e.occurredAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Candidate video */}
      <div className="glass-card p-6 mb-6 animate-fade-in-up">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Candidate Video</h2>
              {selectedVideo && (
                <p className="text-sm text-slate-500 mt-1">Question {selectedVideo.order} recording</p>
              )}
            </div>
            {candidateVideos.length > 1 && (
              <div className="flex flex-wrap justify-end gap-2">
                {candidateVideos.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedVideoId(q.id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selectedVideo?.id === q.id
                        ? "border-blue-400/40 bg-blue-500/20 text-blue-200"
                        : "border-white/10 bg-slate-800/50 text-slate-400 hover:bg-slate-700/60 hover:text-white"
                    }`}
                  >
                    Q{q.order}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedVideo?.videoUrl ? (
            <video
              controls
              className="w-full max-h-[520px] rounded-xl bg-black border border-white/5"
              src={selectedVideo.videoUrl}
            />
          ) : (
            <div className="rounded-xl border border-white/5 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
              No saved candidate video is available for this interview.
            </div>
          )}
        </div>
      </div>

      {/* Questions accordion */}
      <h2 className="text-lg font-semibold text-white mb-3">Question Responses</h2>
      <div className="space-y-3 stagger">
        {test.questions.map((q) => (
          <div key={q.id} className="glass-card overflow-hidden animate-fade-in-up">
            <button
              className="w-full flex justify-between items-center px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
              onClick={() => setOpenQuestion(openQuestion === q.id ? null : q.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-slate-500 text-sm">Q{q.order}</span>
                <span className="text-sm font-medium text-white line-clamp-1">{q.questionText}</span>
                <span className="badge bg-slate-700/50 text-slate-400 border border-white/5">{q.category}</span>
              </div>
              <div className="flex items-center gap-3">
                {q.aiScore !== null && (
                  <span className={`text-sm font-bold ${q.aiScore >= 8 ? "text-emerald-400" : q.aiScore >= 6 ? "text-amber-400" : "text-red-400"}`}>
                    {q.aiScore}/10
                  </span>
                )}
                <span className="text-slate-500 text-sm">{openQuestion === q.id ? "▲" : "▼"}</span>
              </div>
            </button>
            {openQuestion === q.id && (
              <div className="px-6 pb-6 border-t border-white/5 animate-fade-in">
                <p className="text-sm text-slate-300 mt-4 font-medium mb-3">{q.questionText}</p>
                {q.videoUrl && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Video Response</p>
                    <video controls className="w-full max-w-2xl rounded-xl bg-black border border-white/5" src={q.videoUrl} />
                  </div>
                )}
                {q.transcript && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Transcript</p>
                    <p className="text-sm text-slate-300 bg-slate-800/50 border border-white/5 p-3 rounded-xl">{q.transcript}</p>
                  </div>
                )}
                {q.codeResponse && (
                  <div className="mb-4">
                    <p className="text-xs font-medium text-slate-500 mb-1">Code Response</p>
                    <pre className="text-xs bg-[#0a0e1a] text-emerald-300 p-4 rounded-xl overflow-auto border border-white/5">{q.codeResponse}</pre>
                  </div>
                )}
                {q.aiScore !== null && (
                  <div className="bg-blue-500/10 border border-blue-500/15 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-lg font-bold ${q.aiScore >= 8 ? "text-emerald-400" : q.aiScore >= 6 ? "text-amber-400" : "text-red-400"}`}>{q.aiScore}/10</span>
                    </div>
                    {q.aiRationale && <p className="text-sm text-slate-300">{q.aiRationale}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
