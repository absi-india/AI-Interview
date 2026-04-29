"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const CodeEditor = dynamic(() => import("./CodeEditor"), { ssr: false });

type Question = {
  id: string;
  order: number;
  questionText: string;
  category: string;
  codeLanguageHint: string | null;
};

type Props = {
  inviteToken: string;
  candidateName: string;
  jobTitle: string;
  level: string;
  questions: Question[];
  initialStatus: string;
};

const TOTAL_SECONDS = 30 * 60; // 30-minute limit
const RULES = [
  "Your camera and microphone will be active for the entire interview",
  "You must remain in fullscreen mode at all times",
  "Switching tabs or windows will be flagged and may terminate your interview",
  "Copy-paste is disabled in all response fields",
  "Your face must remain visible on camera throughout",
  "Use of a second device or phone is prohibited",
  "The interview session is monitored and recorded",
];

export function InterviewExperience({ inviteToken, candidateName, jobTitle, level, questions, initialStatus }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<"prechecks" | "interview" | "done">(
    initialStatus === "IN_PROGRESS" ? "interview" : "prechecks"
  );
  const [agreed, setAgreed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  const [fraudCount, setFraudCount] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [codeResponse, setCodeResponse] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showFullscreenOverlay, setShowFullscreenOverlay] = useState(false);
  const fullscreenExits = useRef(0);
  const tabSwitches = useRef(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListenRef = useRef(false);
  const transcriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartedAtSecondsLeft = useRef<number>(TOTAL_SECONDS);

  const attachPreviewStream = useCallback(() => {
    const stream = streamRef.current;
    const videoEl = videoRef.current;
    if (!stream || !videoEl) return;

    // The preview video element is re-mounted between prechecks/interview layouts.
    // Re-attach the active stream whenever the element changes.
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }

    const firstVideoTrack = stream.getVideoTracks()[0];
    if (firstVideoTrack && !firstVideoTrack.enabled) {
      firstVideoTrack.enabled = true;
    }

    void videoEl.play().catch(() => undefined);
  }, []);

  const logFraud = useCallback(
    async (type: string, severity: string, detail: string) => {
      setFraudCount((c) => c + 1);
      fetch(`/api/interview/${inviteToken}/fraud-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, severity, detail }),
      }).catch(() => undefined);
    },
    [inviteToken]
  );

  const setTranscriptValue = useCallback((value: string | ((current: string) => string)) => {
    const nextValue = typeof value === "function" ? value(transcriptRef.current) : value;
    transcriptRef.current = nextValue;
    setTranscript(nextValue);
  }, []);

  function startSpeechRecognition() {
    const SpeechRecognitionAPI =
      ("SpeechRecognition" in window ? (window as Window).SpeechRecognition : null) ??
      ("webkitSpeechRecognition" in window ? (window as Window).webkitSpeechRecognition : null);

    if (!SpeechRecognitionAPI || !shouldListenRef.current) return;

    if (recognitionRestartTimerRef.current) {
      clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }

      if (final) {
        interimTranscriptRef.current = "";
        setTranscriptValue((current) => `${current} ${final}`.replace(/\s+/g, " ").trim());
        return;
      }

      if (interim) {
        interimTranscriptRef.current = interim;
        setTranscript(`${transcriptRef.current} ${interim}`.replace(/\s+/g, " ").trim());
      }
    };
    recognition.onerror = () => {
      // Chrome may emit transient no-speech/network errors. onend will restart while recording.
    };
    recognition.onend = () => {
      if (!shouldListenRef.current) return;
      recognitionRestartTimerRef.current = setTimeout(startSpeechRecognition, 250);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRestartTimerRef.current = setTimeout(startSpeechRecognition, 500);
    }
  }

  async function requestCamera() {
    if (!window.isSecureContext) {
      setCameraReady(false);
      setCameraError("Camera access requires HTTPS. Open this interview on localhost for local testing, or use an HTTPS ngrok/cloudflared link.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraReady(false);
      setCameraError("Camera access is not available in this browser. Please use the latest Chrome or Edge.");
      return;
    }

    setCameraLoading(true);
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setCameraError("");
      attachPreviewStream();
      setCameraReady(true);
    } catch (err: unknown) {
      setCameraReady(false);
      const errorName = err instanceof DOMException ? err.name : "";
      if (errorName === "NotAllowedError") {
        setCameraError("Camera/microphone access was blocked. Click the lock icon in the address bar, allow camera and microphone, then try again.");
      } else if (errorName === "NotFoundError") {
        setCameraError("No camera or microphone was found. Please connect a device and try again.");
      } else if (errorName === "NotReadableError") {
        setCameraError("Camera or microphone is already in use by another app. Close Zoom/Teams/Meet or other camera apps and try again.");
      } else {
        setCameraError("Camera/microphone could not start. Please check browser permissions and try again.");
      }
    } finally {
      setCameraLoading(false);
    }
  }

  async function beginInterview() {
    await fetch(`/api/interview/${inviteToken}/start`, { method: "POST" });
    try { await document.documentElement.requestFullscreen(); } catch { /* ignore */ }
    setPhase("interview");
    startTimer();
    startRecordingForQuestion();
  }

  function startTimer() {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          handleAutoSubmit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  function startRecordingForQuestion() {
    if (!streamRef.current) return;
    attachPreviewStream();
    chunksRef.current = [];
    shouldListenRef.current = true;
    interimTranscriptRef.current = "";
    setTranscriptValue("");
    setCodeResponse("");
    questionStartedAtSecondsLeft.current = timeLeft;

    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(1000);
      recorderRef.current = recorder;
    } catch { /* MediaRecorder not available */ }

    startSpeechRecognition();
  }

  // Keep the self-preview visible across UI transitions and question changes.
  useEffect(() => {
    if (!cameraReady) return;
    attachPreviewStream();
  }, [attachPreviewStream, cameraReady, phase, currentIdx]);

  function stopRecording(): Promise<Blob | null> {
    shouldListenRef.current = false;
    if (recognitionRestartTimerRef.current) {
      clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }
      recorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        resolve(blob.size > 0 ? blob : null);
      };
      recorderRef.current.stop();
    });
  }

  async function handleNext() {
    const q = questions[currentIdx];
    const timeSpent = Math.max(0, questionStartedAtSecondsLeft.current - timeLeft);

    // Log rapid answer
    if (timeSpent < 15 && ["INTERMEDIATE", "ADVANCED", "PRACTICAL"].includes(level)) {
      logFraud("RAPID_ANSWER", "LOW", `Answered in ${Math.round(timeSpent)}s`);
    }

    setUploading(true);
    const blob = await stopRecording();
    const cleanTranscript = `${transcriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, " ").trim();

    const formData = new FormData();
    formData.append("questionId", q.id);
    if (cleanTranscript) formData.append("transcript", cleanTranscript);
    if (codeResponse) formData.append("codeResponse", codeResponse);
    if (blob) formData.append("video", blob, `${q.id}.webm`);

    await fetch(`/api/interview/${inviteToken}/upload`, { method: "POST", body: formData });
    setUploading(false);

    if (currentIdx + 1 >= questions.length) {
      await handleAutoSubmit();
    } else {
      setCurrentIdx((i) => i + 1);
      startRecordingForQuestion();
    }
  }

  async function handleAutoSubmit() {
    clearInterval(timerRef.current!);
    await stopRecording();
    await fetch(`/api/interview/${inviteToken}/submit`, { method: "POST" });
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    router.push(`/interview/${inviteToken}/complete`);
  }

  // Fullscreen enforcement
  useEffect(() => {
    if (phase !== "interview") return;
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setShowFullscreenOverlay(true);
        fullscreenExits.current += 1;
        logFraud("FULLSCREEN_EXIT", "HIGH", `Exit #${fullscreenExits.current}`);
        if (fullscreenExits.current >= 3) handleAutoSubmit();
      } else {
        setShowFullscreenOverlay(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Tab/window blur detection
  useEffect(() => {
    if (phase !== "interview") return;
    const handleVisibility = () => {
      if (document.hidden) {
        tabSwitches.current += 1;
        logFraud("TAB_SWITCH", "MEDIUM", `Switch #${tabSwitches.current}`);
        if (tabSwitches.current >= 5) handleAutoSubmit();
      }
    };
    const handleBlur = () => {
      logFraud("WINDOW_BLUR", "MEDIUM", "Window lost focus");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Copy-paste prevention
  useEffect(() => {
    if (phase !== "interview") return;
    const block = (e: Event) => { e.preventDefault(); logFraud("COPY_PASTE_DETECTED", "MEDIUM", e.type); };
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const q = questions[currentIdx];
  const isPractical = level === "PRACTICAL";
  const insecureCameraMessage =
    phase === "prechecks" && typeof window !== "undefined" && !window.isSecureContext
      ? "Camera access is blocked because this page is opened on a Not secure HTTP address. Use http://localhost:3000 on this laptop, or an HTTPS ngrok/cloudflared invite link for other devices."
      : "";
  const visibleCameraError = cameraError || insecureCameraMessage;

  // Pre-checks screen
  if (phase === "prechecks") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
        <div className="glass-card max-w-2xl w-full p-8 animate-fade-in-up">
          {/* ABSI Branding */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <span className="text-lg font-black text-white">A</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Technical Interview</h1>
              <p className="text-slate-400 text-sm">{candidateName} — {jobTitle} ({level})</p>
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-amber-300 mb-3">Interview Rules</h2>
            <ul className="space-y-2">
              {RULES.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-amber-200/80">
                  <span className="mt-0.5 text-amber-400">•</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <h2 className="font-semibold text-white">Camera Setup</h2>
              {cameraReady && (
                <span className="badge bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Ready</span>
              )}
            </div>
            {!cameraReady && (
              <button onClick={requestCamera} disabled={cameraLoading} className="btn-primary disabled:opacity-70 disabled:cursor-not-allowed">
                {cameraLoading ? "Opening Camera..." : visibleCameraError ? "Try Camera Again" : "Allow Camera & Microphone"}
              </button>
            )}
            {visibleCameraError && <p className="mt-3 text-red-400 text-sm">{visibleCameraError}</p>}
            <video ref={videoRef} autoPlay muted playsInline className={`mt-3 rounded-xl w-64 border border-white/10 ${cameraReady ? "" : "hidden"}`} />
          </div>

          <div className="flex items-center gap-3 mb-6">
            <input
              type="checkbox"
              id="agree"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 accent-blue-500 rounded"
            />
            <label htmlFor="agree" className="text-sm text-slate-300">
              I understand and agree to all interview conditions above
            </label>
          </div>

          <div className="text-sm text-slate-500 mb-4">
            {questions.length} questions • 30-minute limit • Chrome or Edge required
          </div>

          <button
            onClick={beginInterview}
            disabled={!agreed || !cameraReady}
            className="btn-primary w-full py-3 text-base"
          >
            Begin Interview
          </button>
        </div>
      </div>
    );
  }

  // Interview screen
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex flex-col">
      {/* Fullscreen overlay */}
      {showFullscreenOverlay && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center">
          <div className="glass-card p-8 max-w-sm text-center animate-fade-in-up">
            <h2 className="text-xl font-bold text-red-400 mb-2">Fullscreen Required</h2>
            <p className="text-slate-400 mb-4">Please return to fullscreen to continue your interview.</p>
            <button
              onClick={() => document.documentElement.requestFullscreen()}
              className="btn-primary px-6 py-2"
            >
              Return to Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-[#0f1629] border-b border-white/5 text-white px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-xs font-black text-white">A</span>
          </div>
          <span className="text-sm font-medium">Question {currentIdx + 1} of {questions.length}</span>
        </div>
        <div className="flex items-center gap-4">
          {fraudCount > 0 && (
            <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/20">
              ⚠ {fraudCount} warning{fraudCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className={`text-lg font-mono font-bold ${timeLeft < 300 ? "text-red-400" : "text-white"}`} style={timeLeft < 300 ? { textShadow: "0 0 8px rgba(248,113,113,0.5)" } : {}}>
            {mm}:{ss}
          </span>
        </div>
      </div>

      {/* Main content */}
      {isPractical ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Code editor */}
          <div className="flex-[3] flex flex-col">
            <CodeEditor
              language={q.codeLanguageHint ?? "javascript"}
              value={codeResponse}
              onChange={setCodeResponse}
            />
          </div>
          {/* Right: Camera + question */}
          <div className="flex-[2] flex flex-col bg-[#0f1629] border-l border-white/5 p-4">
            <video ref={videoRef} autoPlay muted playsInline className="w-full rounded-xl bg-black mb-4 border border-white/5" style={{ maxHeight: "200px", objectFit: "cover" }} />
            <div className="flex-1 overflow-auto">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{q.category}</p>
              <p className="text-white text-sm leading-relaxed">{q.questionText}</p>
            </div>
            <button
              onClick={handleNext}
              disabled={uploading}
              className="btn-primary mt-4 w-full py-3"
            >
              {uploading ? "Uploading…" : currentIdx + 1 >= questions.length ? "Submit Interview" : "Next Question"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 p-8 max-w-3xl mx-auto w-full">
          <div className="glass-card p-6 mb-6 flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">{q.category}</p>
            <p className="text-white text-xl leading-relaxed">{q.questionText}</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400 mb-6">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording your spoken response
            </span>
            {transcript && <span className="text-emerald-400/80 text-xs line-clamp-1">{transcript.replace(/\[interim:.*?\]/g, "").slice(-80)}</span>}
          </div>
          <video ref={videoRef} autoPlay muted playsInline className="w-32 rounded-xl bg-black mb-6 self-end border border-white/10" />
          <button
            onClick={handleNext}
            disabled={uploading}
            className="btn-primary w-full py-3"
          >
            {uploading ? "Uploading…" : currentIdx + 1 >= questions.length ? "Submit Interview" : "Next Question →"}
          </button>
        </div>
      )}
    </div>
  );
}
