"use client";
import { useEffect, useMemo, useState } from "react";
import { showToast } from "@/components/ui/Toaster";

type Question = {
  id: string;
  order: number;
  questionText: string;
  category: string;
  expectedSummary: string;
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
  Excellent: "text-[#15803d]",
  Good: "text-[#2563eb]",
  Average: "text-[#b45309]",
  "Below Average": "text-[#ea580c]",
  Poor: "text-[#dc2626]",
  "No Answers": "text-[#64748b]",
};

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: "text-[#dc2626] bg-[#fef2f2] border-l-[3px] border-[#dc2626]",
  MEDIUM: "text-[#b45309] bg-[#fffbeb] border-l-[3px] border-[#d97706]",
  LOW: "text-[#475569] bg-[#f8fafc] border-l-[3px] border-[#94a3b8]",
};

const FRAUD_EVENT_LABEL: Record<string, string> = {
  SCREEN_OR_TAB_CHANGE: "Screen/tab change",
  TAB_SWITCH: "Tab switch",
  WINDOW_BLUR: "Window focus lost",
  FULLSCREEN_EXIT: "Fullscreen exit",
  COPY_PASTE_DETECTED: "Copy/paste attempt",
  RAPID_ANSWER: "Rapid answer",
};

const ATTENTION_EVENT_TYPES = new Set([
  "SCREEN_OR_TAB_CHANGE",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
]);

function scoreOutOfFive(score: number) {
  return Math.round((score / 2) * 10) / 10;
}

function scoreColorClass(score: number) {
  const fivePointScore = scoreOutOfFive(score);
  if (fivePointScore >= 4) return "text-[#15803d]";
  if (fivePointScore >= 3) return "text-[#b45309]";
  return "text-[#dc2626]";
}

function formatScore(score: number) {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

function happenedDuringInterview(event: FraudEvent, completedAt: string | null) {
  if (!completedAt) return true;
  return new Date(event.occurredAt).getTime() <= new Date(completedAt).getTime();
}

function ringStroke(scoreFive: number) {
  if (scoreFive >= 4) return "#15803d";
  if (scoreFive >= 3) return "#b45309";
  return "#dc2626";
}

/** Animated donut showing the overall score out of 5. */
function ScoreRing({ scoreFive, rating, ratingClass }: { scoreFive: number; rating: string | null; ratingClass: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  const r = 46;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, scoreFive / 5));
  const stroke = ringStroke(scoreFive);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-[118px] w-[118px]">
        <svg viewBox="0 0 118 118" className="h-full w-full -rotate-90">
          <circle cx="59" cy="59" r={r} fill="none" stroke="#e8edf3" strokeWidth="9" />
          <circle
            cx="59"
            cy="59"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={mounted ? c * (1 - frac) : c}
            style={{ transition: "stroke-dashoffset 1.3s cubic-bezier(0.2, 0.7, 0.3, 1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[27px] font-bold leading-none tracking-tight" style={{ color: stroke }}>
            {scoreFive.toFixed(1)}
          </span>
          <span className="font-mono text-[10px] text-[#94a3b8]">out of 5</span>
        </div>
      </div>
      {rating && (
        <span className={`badge ${ratingClass}`} style={{ background: "#f1f5f9" }}>
          {rating}
        </span>
      )}
    </div>
  );
}

export function TestResultsClient({ test, shareUrl }: { test: Test; shareUrl?: string }) {
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingPerformance, setSendingPerformance] = useState(false);
  const [rerating, setRerating] = useState(false);
  const [fraudOpen, setFraudOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [barsMounted, setBarsMounted] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBarsMounted(true), 120);
    return () => window.clearTimeout(t);
  }, []);

  function copyShare() {
    if (shareUrl) navigator.clipboard.writeText(shareUrl);
    showToast("Share link copied to clipboard");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function sendPerformanceEmail() {
    setSendingPerformance(true);

    try {
      const response = await fetch(`/api/tests/${test.id}/send-performance`, { method: "POST" });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast(typeof body?.error === "string" ? body.error : "Failed to send performance email", "error");
        return;
      }

      showToast(`Performance email sent to ${test.candidate.email}`);
    } catch {
      showToast("Failed to send performance email. Please try again.", "error");
    } finally {
      setSendingPerformance(false);
    }
  }

  async function rerateWithAI({ retranscribe = false } = {}) {
    setRerating(true);

    try {
      const response = await fetch(`/api/tests/${test.id}/rerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retranscribe }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        showToast(typeof body?.error === "string" ? body.error : "Failed to re-run AI scoring", "error");
        return;
      }

      if (retranscribe) {
        const t = (body as { transcription?: { attempted: number; recovered: number; reasons: string[] } }).transcription;
        if (t && t.attempted > 0 && t.recovered === 0) {
          // Nothing was recovered — say why rather than reporting a hollow success.
          const why = t.reasons[0] ?? "the recordings could not be transcribed";
          showToast(`No answers could be recovered — ${why}`, "error");
          return;
        }
        showToast(
          t ? `Re-read ${t.recovered} of ${t.attempted} recordings — refreshing results` : "Recordings re-read — refreshing results",
        );
      } else {
        showToast("AI scoring updated — refreshing results");
      }
      window.location.reload();
    } catch {
      showToast("Failed to re-run AI scoring. Please try again.", "error");
    } finally {
      setRerating(false);
    }
  }

  // Average score per question category (answered questions only) — "skill breakdown"
  const categoryStats = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const q of test.questions) {
      if (q.aiScore === null) continue;
      const key = q.category?.trim() || "General";
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += q.aiScore;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([category, { total, count }]) => ({
        category,
        avgFive: Math.round((total / count / 2) * 10) / 10,
        count,
      }))
      .sort((a, b) => b.avgFive - a.avgFive);
  }, [test.questions]);

  const SESSION_ORIGIN_EVENT = "SESSION_ORIGIN";
  const eventsDuringInterview = test.fraudEvents.filter((event) => happenedDuringInterview(event, test.completedAt));
  // Where the interview was taken from is context, not a violation, so it is
  // kept out of the integrity counts and shown on its own.
  const sessionOrigin = eventsDuringInterview.find((e) => e.type === SESSION_ORIGIN_EVENT);
  const fraudEvents = eventsDuringInterview.filter((e) => e.type !== SESSION_ORIGIN_EVENT);
  const highCount = fraudEvents.filter((e) => e.severity === "HIGH").length;
  const mediumCount = fraudEvents.filter((e) => e.severity === "MEDIUM").length;
  const lowCount = fraudEvents.filter((e) => e.severity === "LOW").length;
  const attentionEventCount = fraudEvents.filter((e) => ATTENTION_EVENT_TYPES.has(e.type)).length;

  const scoreColor = SCORE_COLOR[test.overallRating ?? ""] ?? "text-white";
  const candidateVideos = test.questions.filter((q) => q.videoUrl);
  const selectedVideo = candidateVideos.find((q) => q.id === selectedVideoId) ?? candidateVideos[0];
  const overallScore = test.overallScore !== null ? scoreOutOfFive(test.overallScore) : null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="glass-card p-6 mb-6 animate-fade-in-up">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">{test.candidate.name}</h1>
            <p className="text-[#64748b] mt-0.5">{test.jobTitle} • <span className="font-semibold text-[#4f46e5]">{test.level}</span></p>
            <p className="font-mono text-xs text-[#94a3b8] mt-1.5">
              {test.completedAt ? `Completed ${new Date(test.completedAt).toLocaleString()}` : `Status: ${test.status}`}
              {test.timeUsedSeconds ? ` • ${Math.floor(test.timeUsedSeconds / 60)}m ${test.timeUsedSeconds % 60}s` : ""}
            </p>
          </div>
          <div className="text-right pl-6">
            {test.overallRating === "No Answers" ? (
              <div className="text-right">
                <div className="text-lg font-semibold text-[#64748b]">Not Scored</div>
                <div className="text-xs text-[#94a3b8] mt-1">No answers captured</div>
              </div>
            ) : test.overallScore !== null && overallScore !== null ? (
              <ScoreRing scoreFive={overallScore} rating={test.overallRating} ratingClass={scoreColor} />
            ) : (
              <div className="text-[#64748b] text-sm">
                {test.status === "COMPLETED" ? "Scoring in progress…" : test.status.replace(/_/g, " ")}
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
        {shareUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={sendPerformanceEmail}
              disabled={sendingPerformance}
              className="btn-primary text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {sendingPerformance ? "Sending..." : "Send Performance Email"}
            </button>
            {test.status === "COMPLETED" && (
              <button
                onClick={() => rerateWithAI()}
                disabled={rerating}
                className="btn-secondary text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {rerating ? "Re-scoring..." : "Re-run AI Scoring"}
              </button>
            )}
            {test.status === "COMPLETED" && test.questions.some((q) => q.videoUrl) && (
              <button
                onClick={() => rerateWithAI({ retranscribe: true })}
                disabled={rerating}
                title="Reads the answers again from the recordings, replacing the saved transcripts, then re-scores"
                className="btn-secondary text-sm disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {rerating ? "Working..." : "Re-transcribe from Video"}
              </button>
            )}
          </div>
        )}
        {test.overallRating === "No Answers" && (
          <div className="mt-4 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm text-[#92590f]">
            <p className="font-semibold mb-1 text-[#b45309]">No answers were captured for this interview.</p>
            <p>All questions either timed out or produced no transcript or written response. This is usually caused by the candidate denying microphone permission, having a broken microphone, or a poor network connection during upload. Review the video recordings manually if available.</p>
          </div>
        )}
        {attentionEventCount > 0 && (
          <div className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
            Candidate changed tabs, windows, or fullscreen {attentionEventCount} time{attentionEventCount === 1 ? "" : "s"} during the interview.
          </div>
        )}
      </div>

      {/* Skill breakdown by question category */}
      {categoryStats.length > 0 && (
        <div className="glass-card p-6 mb-6 animate-fade-in-up">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <h2 className="text-lg font-semibold text-[#0f172a]">Skill Breakdown</h2>
            <span className="font-mono text-xs text-[#94a3b8]">avg score per category · out of 5</span>
          </div>
          <div className="space-y-4">
            {categoryStats.map((s) => (
              <div key={s.category}>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-sm font-medium text-[#334155] capitalize">
                    {s.category}
                    <span className="ml-2 font-mono text-[11px] font-normal text-[#94a3b8]">
                      {s.count} question{s.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className={`font-mono text-sm font-bold ${scoreColorClass(s.avgFive * 2)}`}>
                    {s.avgFive.toFixed(1)}/5
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#eef1f5]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: barsMounted ? `${(s.avgFive / 5) * 100}%` : "0%",
                      background: ringStroke(s.avgFive),
                      transition: "width 1s cubic-bezier(0.2, 0.7, 0.3, 1)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Where the interview was taken from */}
      {sessionOrigin && (
        <div className="glass-card p-5 mb-6 animate-fade-in-up">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#eff4ff] text-[#2563eb]">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[#0f172a]">Session Origin</h2>
              <p className="mt-0.5 font-mono text-[13px] text-[#334155] break-words">{sessionOrigin.detail}</p>
              <p className="mt-1.5 text-[11.5px] leading-snug text-[#94a3b8]">
                Recorded when the interview began. Location is estimated from the network address — usually the right
                city, and a VPN will report wherever it connects through. Treat it as a prompt to look closer, not as proof.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fraud summary */}
      {fraudEvents.length > 0 && (
        <div className="glass-card p-6 mb-6 animate-fade-in-up">
          <button
            className="w-full flex justify-between items-center text-left"
            onClick={() => setFraudOpen((o) => !o)}
          >
            <h2 className="text-lg font-semibold text-[#0f172a]">Interview Integrity Report</h2>
            <div className="flex gap-3 text-sm items-center">
              {highCount > 0 && <span className="font-mono text-[#dc2626] font-medium">HIGH: {highCount}</span>}
              {mediumCount > 0 && <span className="font-mono text-[#d97706] font-medium">MED: {mediumCount}</span>}
              {lowCount > 0 && <span className="font-mono text-[#64748b] font-medium">LOW: {lowCount}</span>}
              <span className="text-[#94a3b8]">{fraudOpen ? "▲" : "▼"}</span>
            </div>
          </button>
          {fraudOpen && (
            <div className="mt-4 space-y-2 animate-fade-in">
              {fraudEvents.map((e) => (
                <div key={e.id} className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm ${SEVERITY_COLOR[e.severity] ?? "bg-[#f8fafc]"}`}>
                  <div>
                    <span className="font-medium">{FRAUD_EVENT_LABEL[e.type] ?? e.type.replace(/_/g, " ")}</span>
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
              <h2 className="text-lg font-semibold text-[#0f172a]">Candidate Video</h2>
              {selectedVideo && (
                <p className="font-mono text-xs text-[#94a3b8] mt-1">Question {selectedVideo.order} recording</p>
              )}
            </div>
            {candidateVideos.length > 1 && (
              <div className="flex flex-wrap justify-end gap-2">
                {candidateVideos.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedVideoId(q.id)}
                    className={`rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                      selectedVideo?.id === q.id
                        ? "bg-[#2563eb] text-white"
                        : "bg-[#f1f5f9] text-[#64748b] hover:bg-[#e2e8f0] hover:text-[#334155]"
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
              className="w-full max-h-[520px] rounded-xl bg-black border border-[#e7ebf0]"
              src={selectedVideo.videoUrl}
            />
          ) : (
            <div className="rounded-xl border border-[#e7ebf0] bg-[#f8fafc] px-4 py-6 text-sm text-[#64748b]">
              No saved candidate video is available for this interview.
            </div>
          )}
        </div>
      </div>

      {/* Questions accordion */}
      <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Question Responses</h2>
      <div className="space-y-3 stagger">
        {test.questions.map((q) => (
          <div key={q.id} className="glass-card overflow-hidden animate-fade-in-up">
            <button
              className="w-full flex justify-between items-center px-6 py-4 text-left hover:bg-[#fafbfd] transition-colors"
              onClick={() => setOpenQuestion(openQuestion === q.id ? null : q.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold text-[#2563eb] text-sm">Q{q.order}</span>
                <span className="text-sm font-medium text-[#0f172a] line-clamp-1">{q.questionText}</span>
                <span className="badge bg-[#f1f5f9] text-[#475569]">{q.category}</span>
              </div>
              <div className="flex items-center gap-3">
                {q.aiScore !== null ? (
                  <span className={`font-mono text-sm font-bold ${scoreColorClass(q.aiScore)}`}>
                    {formatScore(scoreOutOfFive(q.aiScore))}/5
                  </span>
                ) : q.aiRationale ? (
                  <span className="badge bg-[#fef3c7] text-[#b45309]">Not answered</span>
                ) : null}
                <span className="text-[#94a3b8] text-sm">{openQuestion === q.id ? "▲" : "▼"}</span>
              </div>
            </button>
            {openQuestion === q.id && (
              <div className="px-6 pb-6 border-t border-[#f0f2f6] animate-fade-in">
                <p className="text-sm text-[#0f172a] mt-4 font-medium mb-3">{q.questionText}</p>
                {q.expectedSummary && (
                  <div className="mb-4">
                    <p className="mono-eyebrow text-[10.5px] mb-1.5">Expected Answer</p>
                    <p className="text-sm text-[#15803d] bg-[#f0fdf4] border border-[#dcfce7] p-3 rounded-xl">{q.expectedSummary}</p>
                  </div>
                )}
                {q.videoUrl && (
                  <div className="mb-4">
                    <p className="mono-eyebrow text-[10.5px] mb-1.5">Video Response</p>
                    <video controls className="w-full max-w-2xl rounded-xl bg-black border border-[#e7ebf0]" src={q.videoUrl} />
                  </div>
                )}
                {q.transcript && (
                  <div className="mb-4">
                    <p className="mono-eyebrow text-[10.5px] mb-1.5">Transcript</p>
                    <p className="text-sm text-[#475569] bg-[#f8fafc] border border-[#eef1f5] p-3 rounded-xl">{q.transcript}</p>
                  </div>
                )}
                {q.codeResponse && (
                  <div className="mb-4">
                    <p className="mono-eyebrow text-[10.5px] mb-1.5">Code Response</p>
                    <pre className="text-xs bg-[#0b1220] text-[#cbd5e1] p-4 rounded-xl overflow-auto border border-[#1e293b] font-mono">{q.codeResponse}</pre>
                  </div>
                )}
                {q.aiScore !== null ? (
                  <div className="bg-[#eff4ff] border border-[#dbe6ff] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-mono text-lg font-bold ${scoreColorClass(q.aiScore)}`}>{formatScore(scoreOutOfFive(q.aiScore))}/5</span>
                    </div>
                    {q.aiRationale && <p className="text-sm text-[#3b5bbf]">{q.aiRationale}</p>}
                  </div>
                ) : q.aiRationale ? (
                  <div className="bg-[#fffbeb] border border-[#fde68a] rounded-xl p-4">
                    <p className="mono-eyebrow text-[10.5px] !text-[#b45309] font-semibold mb-1">Not scored — no answer captured</p>
                    <p className="text-sm text-[#92590f]">{q.aiRationale}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
