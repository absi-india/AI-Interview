"use client";

import { useMemo, useRef, useState } from "react";
import { showToast } from "@/components/ui/Toaster";
import { ResumePreview } from "@/components/resume/ResumePreview";
import { TEMPLATES } from "@/lib/resume-formatting/templates";
import {
  applyAcceptedSuggestions,
  countSuggestions,
  liveScores,
} from "@/lib/resume-formatting/apply";
import type {
  AnalyzeResult,
  ResumeModel,
  Suggestion,
  SuggestionStatus,
  SuggestionType,
  TemplateId,
} from "@/lib/resume-formatting/types";

type Step = "select" | "upload" | "editor";
type ViewMode = "split" | "original" | "formatted";

const TYPE_LABEL: Record<SuggestionType, string> = {
  spelling: "Spelling",
  grammar: "Grammar",
  "professional-wording": "Professional wording",
  clarity: "Clarity",
  ats: "ATS improvement",
  formatting: "Formatting",
  "date-inconsistency": "Date inconsistency",
  duplicate: "Duplicate content",
  "missing-info": "Missing information",
};

const STATUS_STYLE: Record<SuggestionStatus, string> = {
  pending: "bg-[#eff4ff] text-[#1d4ed8] border-[#dbe6ff]",
  accepted: "bg-[#f0fdf4] text-[#15803d] border-[#bbf7d0]",
  rejected: "bg-[#fef2f2] text-[#dc2626] border-[#fecaca]",
  edited: "bg-[#fdf4ff] text-[#a21caf] border-[#f5d0fe]",
  clarify: "bg-[#fffbeb] text-[#b45309] border-[#fde68a]",
};

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function ResumeFormattingApp() {
  const [step, setStep] = useState<Step>("select");
  const [templateId, setTemplateId] = useState<TemplateId>("vectorvms");

  // upload
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // editor
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<Suggestion[][]>([]);
  const [future, setFuture] = useState<Suggestion[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("split");
  const [zoom, setZoom] = useState(1);
  const [leftPct, setLeftPct] = useState(48);
  const [rail, setRail] = useState<"suggestions" | "score" | "details">("suggestions");
  const [exporting, setExporting] = useState(false);
  const [details, setDetails] = useState<ResumeModel | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const splitRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── derived ──
  const baseModel = details ?? result?.model ?? null;
  const appliedModel = useMemo(
    () => (baseModel ? applyAcceptedSuggestions(baseModel, suggestions) : null),
    [baseModel, suggestions],
  );
  const scores = useMemo(
    () => (result ? liveScores(result.scores, suggestions) : null),
    [result, suggestions],
  );
  const counts = useMemo(() => countSuggestions(suggestions), [suggestions]);
  const pendingList = useMemo(() => suggestions.filter((s) => s.status === "pending"), [suggestions]);

  // ── upload ──
  function chooseFile(f: File | null) {
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "doc", "docx"].includes(ext)) {
      setUploadError("Please upload a PDF, DOC, or DOCX file.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setUploadError("File is too large. Maximum size is 10 MB.");
      return;
    }
    setUploadError("");
    setFile(f);
  }

  function analyze() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    setUploadError("");

    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/resume-format/analyze");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setBusy(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as AnalyzeResult;
          setResult(data);
          setDetails(data.model);
          setSuggestions([]);
          setHistory([]);
          setFuture([]);
          setSelectedId(null);
          setStep("editor");
          showToast("Resume formatted — reviewing wording in the background…", "success");
          void loadSuggestions(data.rawText);
        } catch {
          setUploadError("Something went wrong reading the analysis. Please try again.");
        }
      } else {
        let msg = "";
        try {
          msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? "";
        } catch {
          // Non-JSON body means the platform returned the error, not our route —
          // almost always the request timing out on a very long resume.
        }
        setUploadError(
          msg ||
            (xhr.status === 504 || xhr.status === 0
              ? "This resume took too long to analyze. Please try again — if it keeps failing, shorten the resume or split it."
              : `We couldn't process this file (error ${xhr.status}). Please try again, or save it as a PDF and re-upload.`),
        );
      }
    };
    xhr.onerror = () => {
      setBusy(false);
      setUploadError("Upload failed. Please check your connection and try again.");
    };
    xhr.send(fd);
  }

  /** Second pass — runs after the editor is open so it never blocks the user. */
  async function loadSuggestions(rawText: string) {
    setReviewing(true);
    try {
      const res = await fetch("/api/resume-format/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { suggestions?: Suggestion[] };
      const list = data.suggestions ?? [];
      setSuggestions(list);
      setSelectedId(list[0]?.id ?? null);
      showToast(
        list.length
          ? `${list.length} suggestion${list.length === 1 ? "" : "s"} ready to review.`
          : "No wording issues found.",
        list.length ? "success" : "info",
      );
    } catch {
      // Non-fatal — the resume is already formatted and editable.
    } finally {
      setReviewing(false);
    }
  }

  // ── suggestion actions (with undo history) ──
  function mutate(next: Suggestion[]) {
    setHistory((h) => [...h, suggestions]);
    setFuture([]);
    setSuggestions(next);
  }
  function setStatus(id: string, status: SuggestionStatus, editedText?: string) {
    mutate(
      suggestions.map((s) =>
        s.id === id ? { ...s, status, editedText: editedText ?? s.editedText } : s,
      ),
    );
  }
  function acceptAllSimilar(type: SuggestionType) {
    mutate(suggestions.map((s) => (s.type === type && s.status === "pending" ? { ...s, status: "accepted" } : s)));
    showToast(`Accepted all pending ${TYPE_LABEL[type].toLowerCase()} suggestions.`, "success");
  }
  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [suggestions, ...f]);
    setSuggestions(prev);
  }
  function redo() {
    if (!future.length) return;
    const nxt = future[0];
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, suggestions]);
    setSuggestions(nxt);
  }
  function undoAll() {
    if (!result) return;
    mutate(result.suggestions.map((s) => ({ ...s, status: "pending", editedText: undefined })));
    setDetails(result.model);
    showToast("Restored the original — all AI changes reverted.", "info");
  }

  // ── divider drag ──
  function onDividerDown(e: React.PointerEvent) {
    e.preventDefault();
    const move = (ev: PointerEvent) => {
      const el = splitRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(22, Math.min(78, pct)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ── export ──
  async function exportDocx() {
    if (!appliedModel) return;
    setExporting(true);
    try {
      const res = await fetch("/api/resume-format/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: appliedModel, templateId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        showToast(body.error ?? "Export failed. Please try again.", "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? "resume.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("DOCX downloaded.", "success");
    } finally {
      setExporting(false);
    }
  }

  // ── left panel highlighted original ──
  const leftHtml = useMemo(() => {
    if (!result) return "";
    const raw = escapeHtml(result.rawText);
    const sel = suggestions.find((s) => s.id === selectedId);
    if (!sel) return raw;
    const target = escapeHtml(sel.original);
    if (!target || !raw.includes(target)) return raw;
    return raw.replace(
      target,
      `<mark id="orig-hl" style="background:#fde68a;color:#7c2d12;padding:0 2px;border-radius:2px">${target}</mark>`,
    );
  }, [result, suggestions, selectedId]);

  function selectSuggestion(id: string) {
    setSelectedId(id);
    setTimeout(() => document.getElementById("orig-hl")?.scrollIntoView({ block: "center", behavior: "smooth" }), 40);
  }

  // ── RENDER: format selection ──
  if (step === "select") {
    return (
      <div className="mx-auto max-w-5xl p-6 lg:p-7">
        <h1 className="text-[22px] font-semibold tracking-tight text-[#0f172a]">Choose a resume format</h1>
        <p className="mt-1 text-sm text-[#64748b]">Pick the template you want, then upload the candidate&rsquo;s existing resume.</p>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {Object.values(TEMPLATES).map((t) => (
            <div key={t.id} className="glass-card flex flex-col p-5">
              <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-[#e7ebf0] bg-[#f8fafc]">
                {t.repeatingLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/ohio-itsa-logo.png" alt="Ohio ITSA" className="h-7 w-auto object-contain" />
                ) : t.underlinedHeadings ? (
                  <div className="w-4/5 border" style={{ borderColor: `#${t.accent}` }}>
                    <div className="border-b px-1.5 py-1" style={{ borderColor: `#${t.accent}` }}>
                      <div className="h-1 w-1/2 rounded bg-gray-600" />
                      <div className="mt-1 h-0.5 w-full rounded bg-gray-300" />
                    </div>
                    <div className="px-1.5 py-1">
                      <div className="h-1 w-1/2 rounded bg-gray-600" />
                      <div className="mt-1 h-0.5 w-3/4 rounded bg-gray-300" />
                    </div>
                  </div>
                ) : (
                  <div className="w-4/5 space-y-1.5">
                    <div className="mx-auto h-2 w-1/2 rounded bg-gray-400" />
                    <div className="h-1 w-full rounded bg-gray-200" />
                    <div className="h-1 w-full rounded bg-gray-200" />
                    <div className="h-1 w-2/3 rounded bg-gray-200" />
                  </div>
                )}
              </div>
              <div className="text-[15px] font-semibold text-[#0f172a]">{t.name}</div>
              <p className="mt-1 flex-1 text-[12.5px] leading-snug text-[#64748b]">{t.description}</p>
              <button
                onClick={() => {
                  setTemplateId(t.id);
                  setStep("upload");
                }}
                className="btn-primary mt-4 w-full"
              >
                Select Format
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── RENDER: upload ──
  if (step === "upload") {
    return (
      <div className="mx-auto max-w-2xl p-6 lg:p-7">
        <button onClick={() => setStep("select")} className="text-sm text-[#64748b] hover:text-[#0f172a]">&larr; Back to formats</button>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[#0f172a]">Upload resume</h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Selected format: <span className="font-semibold text-[#2563eb]">{TEMPLATES[templateId].name}</span>
          {" · "}
          <button onClick={() => setStep("select")} className="underline hover:text-[#0f172a]">change</button>
        </p>

        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); chooseFile(e.dataTransfer.files?.[0] ?? null); }}
            className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${dragOver ? "border-[#2563eb] bg-[#eff4ff]" : "border-[#cbd5e1] bg-[#f8fafc]"}`}
          >
            <svg className="h-10 w-10 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="mt-3 text-sm font-medium text-[#334155]">Drag &amp; drop your resume here</p>
            <p className="text-xs text-[#94a3b8]">PDF, DOC, or DOCX · up to 10 MB</p>
            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary mt-4">Browse files</button>
            <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
          </div>
        ) : (
          <div className="mt-5 glass-card p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-[#eff4ff] text-[#2563eb]">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[#0f172a]">{file.name}</div>
                <div className="text-xs text-[#64748b]">{file.name.split(".").pop()?.toUpperCase()} · {(file.size / 1024).toFixed(0)} KB</div>
              </div>
              {!busy && (
                <div className="flex flex-none gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="btn-secondary px-3 py-1.5 text-xs">Replace</button>
                  <button onClick={() => { setFile(null); setProgress(0); }} className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2]">Remove</button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
            </div>

            {busy && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-[#e7ebf0]">
                  <div className="h-full rounded-full bg-[#2563eb] transition-[width]" style={{ width: `${progress < 100 ? progress : 100}%` }} />
                </div>
                <p className="mt-2 text-xs text-[#64748b]">{progress < 100 ? `Uploading… ${progress}%` : "Analyzing resume with AI — this can take a few seconds…"}</p>
              </div>
            )}

            {!busy && (
              <button onClick={analyze} className="btn-primary mt-4 w-full">Analyze &amp; Format</button>
            )}
          </div>
        )}

        {uploadError && <p className="mt-3 text-sm text-red-600">{uploadError}</p>}
      </div>
    );
  }

  // ── RENDER: editor ──
  if (!result || !appliedModel || !scores || !baseModel) return null;
  const selected = suggestions.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex h-[calc(100vh-62px)] flex-col">
      {/* top toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e1e7f0] bg-white px-4 py-2">
        <button onClick={() => setStep("upload")} className="btn-secondary px-3 py-1.5 text-xs">&larr; Back</button>
        <span className="ml-1 text-sm font-semibold text-[#0f172a]">{TEMPLATES[templateId].name}</span>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value as TemplateId)}
          className="rounded-lg border border-[#dce2ea] bg-white px-2 py-1 text-xs text-[#334155]"
          title="Switch format — approved edits are preserved"
        >
          {Object.values(TEMPLATES).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="mx-1 h-5 w-px bg-[#e1e7f0]" />
        <button onClick={undo} disabled={!history.length} className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40">Undo</button>
        <button onClick={redo} disabled={!future.length} className="btn-secondary px-2.5 py-1.5 text-xs disabled:opacity-40">Redo</button>
        <button onClick={undoAll} className="btn-secondary px-2.5 py-1.5 text-xs">Restore original</button>
        <div className="mx-1 h-5 w-px bg-[#e1e7f0]" />
        <div className="flex overflow-hidden rounded-lg border border-[#dce2ea] text-xs">
          {(["split", "original", "formatted"] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1.5 capitalize ${view === v ? "bg-[#2563eb] text-white" : "bg-white text-[#475569]"}`}>{v}</button>
          ))}
        </div>
        <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))} className="btn-secondary px-2 py-1.5 text-xs">A-</button>
        <span className="text-xs tabular-nums text-[#64748b]">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))} className="btn-secondary px-2 py-1.5 text-xs">A+</button>
        <div className="ml-auto">
          <button onClick={exportDocx} disabled={exporting} className="btn-primary px-4 py-1.5 text-xs disabled:opacity-60">
            {exporting ? "Generating…" : "Download DOCX"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* split panels */}
        <div ref={splitRef} className="relative flex min-w-0 flex-1 bg-[#eef1f6]">
          {view !== "formatted" && (
            <div className="min-w-0 overflow-auto p-4" style={{ width: view === "split" ? `${leftPct}%` : "100%" }}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Original resume</div>
              <pre
                className="whitespace-pre-wrap break-words rounded-lg bg-white p-4 font-sans text-[#334155] shadow-sm"
                style={{ fontSize: `${12 * zoom}px`, lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{ __html: leftHtml }}
              />
            </div>
          )}
          {view === "split" && (
            <div onPointerDown={onDividerDown} className="z-10 flex w-1.5 flex-none cursor-col-resize items-center justify-center bg-[#dbe2ea] hover:bg-[#2563eb]" title="Drag to resize">
              <div className="h-8 w-0.5 rounded bg-white/70" />
            </div>
          )}
          {view !== "original" && (
            <div className="min-w-0 flex-1 overflow-auto p-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Formatted preview · {TEMPLATES[templateId].name}</div>
              <div style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}>
                <ResumePreview model={appliedModel} tmplId={templateId} />
              </div>
            </div>
          )}
        </div>

        {/* right rail */}
        <div className="flex w-[360px] flex-none flex-col border-l border-[#e1e7f0] bg-white">
          <div className="flex border-b border-[#e1e7f0] text-xs">
            {(["suggestions", "score", "details"] as const).map((t) => (
              <button key={t} onClick={() => setRail(t)} className={`flex-1 px-2 py-2.5 capitalize ${rail === t ? "border-b-2 border-[#2563eb] font-semibold text-[#2563eb]" : "text-[#64748b]"}`}>
                {t === "suggestions" ? `Suggestions (${counts.pending})` : t}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {rail === "suggestions" && (
              <div className="space-y-2.5">
                {reviewing && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#dbe6ff] bg-[#eff4ff] px-3 py-2.5">
                    <span className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-[#2563eb] border-t-transparent" />
                    <span className="text-[12px] font-medium text-[#1d4ed8]">Reviewing wording… your formatted resume is ready to edit meanwhile.</span>
                  </div>
                )}
                {!reviewing && suggestions.length === 0 && (
                  <p className="p-4 text-center text-sm text-[#94a3b8]">No AI suggestions — the resume looks clean, or AI analysis was unavailable.</p>
                )}
                {suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    s={s}
                    selected={s.id === selectedId}
                    onSelect={() => selectSuggestion(s.id)}
                    onAccept={() => setStatus(s.id, "accepted")}
                    onReject={() => setStatus(s.id, "rejected")}
                    onRestore={() => setStatus(s.id, "pending", undefined)}
                    onEdit={(text) => setStatus(s.id, "edited", text)}
                    onAcceptSimilar={() => acceptAllSimilar(s.type)}
                  />
                ))}
              </div>
            )}

            {rail === "score" && (
              <div className="space-y-3">
                <ScoreRow label="Overall" value={scores.overall} big />
                <ScoreRow label="Grammar" value={scores.grammar} />
                <ScoreRow label="Spelling" value={scores.spelling} />
                <ScoreRow label="ATS compatibility" value={scores.ats} />
                <ScoreRow label="Readability" value={scores.readability} />
                <ScoreRow label="Formatting" value={scores.formatting} />
                <ScoreRow label="Professional language" value={scores.professional} />
                <div className="grid grid-cols-2 gap-2 pt-2 text-center text-xs">
                  <Stat label="Pending" value={counts.pending} />
                  <Stat label="Accepted" value={counts.accepted + counts.edited} />
                  <Stat label="Rejected" value={counts.rejected} />
                  <Stat label="Clarifications" value={result.clarifications.length} />
                </div>
                <p className="pt-1 text-[10.5px] leading-snug text-[#94a3b8]">Scores are estimates to guide editing. They are not a guarantee of employment or ATS selection.</p>
              </div>
            )}

            {rail === "details" && (
              <DetailsForm model={details ?? result.model} clarifications={result.clarifications} onChange={setDetails} templateId={templateId} />
            )}
          </div>
        </div>
      </div>

      {/* bottom action bar */}
      <div className="flex items-center gap-2 border-t border-[#e1e7f0] bg-white px-4 py-2 text-xs">
        <button
          onClick={() => { const i = pendingList.findIndex((s) => s.id === selectedId); const prev = pendingList[i - 1] ?? pendingList[pendingList.length - 1]; if (prev) selectSuggestion(prev.id); }}
          disabled={!pendingList.length}
          className="btn-secondary px-3 py-1.5 disabled:opacity-40"
        >&larr; Prev</button>
        {selected && selected.status === "pending" && (
          <>
            <button onClick={() => setStatus(selected.id, "rejected")} className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-1.5 font-semibold text-[#dc2626] hover:bg-[#fee2e2]">Reject</button>
            <button onClick={() => setStatus(selected.id, "accepted")} className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-1.5 font-semibold text-[#15803d] hover:bg-[#dcfce7]">Accept</button>
          </>
        )}
        <button
          onClick={() => { const i = pendingList.findIndex((s) => s.id === selectedId); const next = pendingList[i + 1] ?? pendingList[0]; if (next) selectSuggestion(next.id); }}
          disabled={!pendingList.length}
          className="btn-secondary px-3 py-1.5 disabled:opacity-40"
        >Next &rarr;</button>
        <span className="ml-2 text-[#64748b]">{counts.pending} pending · {counts.accepted + counts.edited} accepted · {counts.rejected} rejected</span>
        <button onClick={exportDocx} disabled={exporting} className="btn-primary ml-auto px-4 py-1.5 disabled:opacity-60">
          {exporting ? "Generating…" : "Generate Final Document"}
        </button>
      </div>
    </div>
  );
}

// ── sub-components ──
function SuggestionCard({
  s, selected, onSelect, onAccept, onReject, onRestore, onEdit, onAcceptSimilar,
}: {
  s: Suggestion; selected: boolean; onSelect: () => void; onAccept: () => void; onReject: () => void; onRestore: () => void; onEdit: (t: string) => void; onAcceptSimilar: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.editedText ?? s.suggested);
  return (
    <div onClick={onSelect} className={`cursor-pointer rounded-xl border p-3 transition-shadow ${selected ? "border-[#2563eb] shadow-sm ring-1 ring-[#2563eb]/20" : "border-[#e7ebf0]"}`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[s.status]}`}>{TYPE_LABEL[s.type]}</span>
        <span className="text-[10px] uppercase tracking-wide text-[#94a3b8]">{s.status}</span>
      </div>
      <div className="text-[11px] text-[#64748b]">{s.section}</div>
      <div className="mt-1 rounded-md bg-[#fef2f2] px-2 py-1 text-[11px] text-[#7f1d1d] line-through decoration-[#f87171]/60">{s.original}</div>
      {editing ? (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-[#dce2ea] p-2 text-[11px]" onClick={(e) => e.stopPropagation()} />
      ) : (
        <div className="mt-1 rounded-md bg-[#f0fdf4] px-2 py-1 text-[11px] text-[#14532d]">{s.editedText ?? s.suggested}</div>
      )}
      <div className="mt-1.5 text-[10.5px] italic leading-snug text-[#94a3b8]">{s.reason}</div>
      <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
        {editing ? (
          <>
            <button onClick={() => { onEdit(text); setEditing(false); }} className="rounded-md bg-[#2563eb] px-2 py-1 text-[10.5px] font-semibold text-white">Save edit</button>
            <button onClick={() => setEditing(false)} className="rounded-md border border-[#e7ebf0] px-2 py-1 text-[10.5px]">Cancel</button>
          </>
        ) : (
          <>
            {s.status !== "accepted" && <button onClick={onAccept} className="rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2 py-1 text-[10.5px] font-semibold text-[#15803d]">Accept</button>}
            {s.status !== "rejected" && <button onClick={onReject} className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-2 py-1 text-[10.5px] font-semibold text-[#dc2626]">Reject</button>}
            <button onClick={() => setEditing(true)} className="rounded-md border border-[#e7ebf0] px-2 py-1 text-[10.5px]">Edit</button>
            {(s.status !== "pending") && <button onClick={onRestore} className="rounded-md border border-[#e7ebf0] px-2 py-1 text-[10.5px]">Restore</button>}
            <button onClick={onAcceptSimilar} className="rounded-md border border-[#e7ebf0] px-2 py-1 text-[10.5px] text-[#2563eb]">Accept all similar</button>
          </>
        )}
      </div>
    </div>
  );
}

function ScoreRow({ label, value, big }: { label: string; value: number; big?: boolean }) {
  const color = value >= 75 ? "#15803d" : value >= 50 ? "#b45309" : "#dc2626";
  return (
    <div>
      <div className="flex items-center justify-between text-[12px]">
        <span className={big ? "font-semibold text-[#0f172a]" : "text-[#475569]"}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>{value}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#eef1f6]">
        <div className="h-full rounded-full transition-[width]" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#e7ebf0] py-1.5">
      <div className="text-[15px] font-semibold text-[#0f172a]">{value}</div>
      <div className="text-[10px] text-[#94a3b8]">{label}</div>
    </div>
  );
}

function DetailsForm({
  model, clarifications, onChange, templateId,
}: {
  model: ResumeModel; clarifications: AnalyzeResult["clarifications"]; onChange: (m: ResumeModel) => void; templateId: TemplateId;
}) {
  const hidesContact = TEMPLATES[templateId].hideContactDetails;
  const set = (patch: Partial<ResumeModel>) => onChange({ ...model, ...patch });
  const setContact = (patch: Partial<ResumeModel["contact"]>) => onChange({ ...model, contact: { ...model.contact, ...patch } });
  const field = (label: string, value: string | undefined, on: (v: string) => void) => (
    <label className="block">
      <span className="text-[11px] font-medium text-[#475569]">{label}</span>
      <input value={value ?? ""} onChange={(e) => on(e.target.value)} className="mt-0.5 w-full rounded-md border border-[#dce2ea] px-2 py-1.5 text-[12px]" />
    </label>
  );
  return (
    <div className="space-y-2.5">
      {clarifications.length > 0 && (
        <div className="rounded-lg border border-[#fde68a] bg-[#fffbeb] p-2.5">
          <div className="text-[11px] font-semibold text-[#b45309]">Please confirm ({clarifications.length})</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-[#92400e]">
            {clarifications.map((c) => <li key={c.id}>{c.question}</li>)}
          </ul>
        </div>
      )}
      {field("Full name", model.name, (v) => set({ name: v }))}
      {field("Title / Role", model.title, (v) => set({ title: v }))}
      {field("Current location", model.contact.location, (v) => setContact({ location: v }))}
      {hidesContact && (
        <p className="rounded-md border border-[#dbe6ff] bg-[#eff4ff] px-2 py-1.5 text-[10.5px] leading-snug text-[#1d4ed8]">
          Phone, email and LinkedIn are kept out of the {TEMPLATES[templateId].shortName} resume. They stay saved here and reappear if you switch to Covendis or ABSI.
        </p>
      )}
      {field("Phone", model.contact.phone, (v) => setContact({ phone: v }))}
      {field("Email", model.contact.email, (v) => setContact({ email: v }))}
      {field("VectorVMS requisition #", model.requisitionNumber, (v) => set({ requisitionNumber: v }))}
      <label className="block">
        <span className="text-[11px] font-medium text-[#475569]">Professional summary</span>
        <textarea value={model.summary ?? ""} onChange={(e) => set({ summary: e.target.value })} rows={4} className="mt-0.5 w-full rounded-md border border-[#dce2ea] px-2 py-1.5 text-[12px]" />
      </label>
      <p className="text-[10.5px] leading-snug text-[#94a3b8]">Edits here update the formatted preview and the exported file. Confirmed facts are preserved when you switch formats.</p>
    </div>
  );
}
