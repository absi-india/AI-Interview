"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { BrandLogo } from "@/components/BrandLogo";

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

const TOTAL_SECONDS = 30 * 60;    // 30-minute total limit
const QUESTION_SECONDS = 3 * 60;  // 3-minute per-question limit
const RECORDER_MIME_TYPES = [
  "video/mp4;codecs=h264,aac",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
const RECORDING_OPTIONS = {
  videoBitsPerSecond: 150_000,  // 150kbps — keeps 3-min video ~3.2MB, under Vercel's 4.5MB limit
  audioBitsPerSecond: 32_000,
};
const ATTENTION_EVENT_DEDUP_MS = 750;
// Violations are logged for recruiter review but never force-terminate the interview.
const RULES = [
  "Your camera and microphone will be active for the entire interview",
  "You must remain in fullscreen mode at all times",
  "Switching tabs, windows, or exiting fullscreen is detected and repeated violations can stop your interview",
  "Copy-paste is disabled in all response fields",
  "Your face must remain visible on camera throughout",
  "Use of a second device or phone is prohibited",
  "The interview session is monitored and recorded",
];

const MOBILE_RULES = [
  "Your camera and microphone will be active for the entire interview",
  "Keep this interview tab open and visible until you submit",
  "Switching apps or leaving the interview page is detected and repeated violations can stop your interview",
  "Copy-paste is disabled in all response fields",
  "Your face must remain visible on camera throughout",
  "Use a stable connection and keep the phone unlocked during the interview",
  "The interview session is monitored and recorded",
];

type ProctoringNotice = {
  title: string;
  message: string;
  terminal: boolean;
};

// Cross-browser fullscreen helpers (Safari uses webkit prefix)
function requestFullscreenEl(el: HTMLElement): Promise<void> {
  if (el.requestFullscreen) return el.requestFullscreen();
  const s = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  if (s.webkitRequestFullscreen) return s.webkitRequestFullscreen() ?? Promise.resolve();
  return Promise.resolve();
}
function exitFullscreenDoc(): Promise<void> {
  if (document.exitFullscreen) return document.exitFullscreen();
  const d = document as Document & { webkitExitFullscreen?: () => Promise<void> };
  if (d.webkitExitFullscreen) return d.webkitExitFullscreen() ?? Promise.resolve();
  return Promise.resolve();
}
function getFullscreenEl(): Element | null {
  return document.fullscreenElement ??
    (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement ??
    null;
}

function detectMobileInterview() {
  if (typeof window === "undefined") return false;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  // iPad Pro (iOS 13+) reports a desktop "Macintosh" UA but still has touch points
  const isIpadPro = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return mobileUserAgent || isIpadPro || coarsePointer;
}

export function InterviewExperience({ inviteToken, candidateName, jobTitle, level, questions, initialStatus }: Props) {
  const router = useRouter();
  // Always start at prechecks so camera/recording/timers are properly initialized.
  // If the page was reloaded mid-interview (IN_PROGRESS), the banner in prechecks
  // tells the candidate to reconnect their camera and resume.
  const [phase, setPhase] = useState<"prechecks" | "interview" | "done">("prechecks");
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
  const [uploadError, setUploadError] = useState("");
  const [showFullscreenOverlay, setShowFullscreenOverlay] = useState(false);
  const [proctoringNotice, setProctoringNotice] = useState<ProctoringNotice | null>(null);
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [isMobileInterview, setIsMobileInterview] = useState(false);
  const fullscreenExits = useRef(0);
  const screenOrTabChanges = useRef(0);
  const proctoringViolations = useRef(0);
  const proctoringTerminatedRef = useRef(false);
  const autoSubmitStartedRef = useRef(false);
  const intentionalExitRef = useRef(false);
  const lastAttentionEventAt = useRef(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // First chunk from the recorder contains the WebM/MP4 container header (init segment).
  // Q2+ blobs must be prepended with it or the browser can't decode the video.
  const initSegmentRef = useRef<Blob | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const recognitionRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldListenRef = useRef(false);
  const transcriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartedAtMs = useRef<number>(Date.now());
  const uploadingRef = useRef(false);
  const recordingUnavailableRef = useRef(false);
  const nextLockRef = useRef(false);
  // Mirror of currentIdx in a ref so timer callbacks always read the current value
  // even when captured in a stale closure.
  const currentIdxRef = useRef(0);

  useEffect(() => {
    currentIdxRef.current = currentIdx;
  }, [currentIdx]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsMobileInterview(detectMobileInterview());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      if (intentionalExitRef.current) return;
      setFraudCount((c) => c + 1);
      fetch(`/api/interview/${inviteToken}/fraud-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ type, severity, detail }),
      }).catch(() => undefined);
    },
    [inviteToken]
  );

  function recordProctoringViolation(type: string, detail: string) {
    if (intentionalExitRef.current || autoSubmitStartedRef.current) return;

    const nextCount = proctoringViolations.current + 1;
    proctoringViolations.current = nextCount;
    logFraud(
      type,
      "HIGH",
      `${detail} (Proctoring violation ${nextCount})`
    );

    // First violation: show a visible warning so the candidate knows to stay on screen.
    // We never force-terminate — violations are logged for recruiter review only.
    if (nextCount === 1) {
      setShowFullscreenOverlay(false);
      setProctoringNotice({
        title: "Stay on this screen",
        message:
          "You left the interview screen. Switching tabs, apps, or losing focus is recorded and reported to the recruiter. Please stay on this page.",
        terminal: false,
      });
    }
  }

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640, max: 960 },
          height: { ideal: 360, max: 540 },
          frameRate: { ideal: 15, max: 20 },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Verify both camera and microphone tracks are present
      const missingVideo = stream.getVideoTracks().length === 0;
      const missingAudio = stream.getAudioTracks().length === 0;
      if (missingVideo || missingAudio) {
        stream.getTracks().forEach((t) => t.stop());
        const missing = missingVideo && missingAudio ? "camera and microphone" : missingVideo ? "camera" : "microphone";
        setCameraError(`${missing.charAt(0).toUpperCase() + missing.slice(1)} access is required to start the interview. No ${missing} was detected. Please connect a ${missing} and try again.`);
        return;
      }
      streamRef.current = stream;
      setCameraError("");
      attachPreviewStream();
      setCameraReady(true);
    } catch (err: unknown) {
      setCameraReady(false);
      const errorName = err instanceof DOMException ? err.name : "";
      if (errorName === "NotAllowedError") {
        setCameraError("You must allow camera and microphone access to take this interview. Click the lock icon in your browser address bar, set Camera and Microphone to 'Allow', then click 'Try Camera Again'.");
      } else if (errorName === "NotFoundError") {
        setCameraError("No camera or microphone was found on this device. Please connect a camera and microphone, then try again.");
      } else if (errorName === "NotReadableError") {
        setCameraError("Camera or microphone is already in use by another app. Close Zoom, Teams, Meet, or any other camera app, then try again.");
      } else {
        setCameraError("Camera/microphone could not start. Please check browser permissions and try again.");
      }
    } finally {
      setCameraLoading(false);
    }
  }

  async function beginInterview() {
    if (!cameraReady) return;
    const startRes = await fetch(`/api/interview/${inviteToken}/start`, { method: "POST" });
    if (!startRes.ok) {
      const body = await startRes.json().catch(() => ({}));
      setCameraError(
        (body as { error?: string }).error ??
        "Could not start the interview. The link may have expired — please contact your recruiter."
      );
      return;
    }
    if (!isMobileInterview) {
      try { await requestFullscreenEl(document.documentElement); } catch { /* ignore */ }
    }
    setPhase("interview");
    startContinuousRecording();
    setShowStartWarning(true);
    // startTimer() and startRecordingForQuestion() are called when the candidate
    // dismisses the start warning, so Q1's 3-minute clock doesn't tick while they read it.
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

  function startQuestionTimer() {
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    setQuestionTimeLeft(QUESTION_SECONDS);
    questionTimerRef.current = setInterval(() => {
      setQuestionTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(questionTimerRef.current!);
          void handleQuestionTimeout();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  async function handleQuestionTimeout() {
    if (uploadingRef.current || nextLockRef.current || autoSubmitStartedRef.current || proctoringTerminatedRef.current) return;
    nextLockRef.current = true;
    console.info("[interview] question timer expired", { idx: currentIdxRef.current, chunks: chunksRef.current.length, recorderState: recorderRef.current?.state });
    let uploaded = await uploadCurrentQuestion({ restartOnFailure: false });
    if (!uploaded) {
      // Transcript is still in transcriptRef.current; recorder keeps running so
      // new chunks accumulate. Wait 3s then retry — preserves the text answer.
      await new Promise<void>((r) => setTimeout(r, 3000));
      uploaded = await uploadCurrentQuestion({ restartOnFailure: false });
      if (!uploaded) console.warn("[interview] upload retry failed for question", currentIdxRef.current, "— moving on");
    }
    nextLockRef.current = false;
    if (currentIdxRef.current + 1 >= questions.length) {
      await submitInterview();
    } else {
      setCurrentIdx((i) => i + 1);
      startRecordingForQuestion();
    }
  }

  // Start ONE recorder for the whole interview. Never stopped between questions —
  // only snapshotted. This prevents phones from producing empty blobs when a new
  // MediaRecorder is created on the same stream after the previous one stopped.
  function startContinuousRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    initSegmentRef.current = null;
    recorderRef.current = null;
    recordingUnavailableRef.current = false;
    if (!("MediaRecorder" in window)) {
      recordingUnavailableRef.current = true;
      return;
    }
    try {
      const mimeType = RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        streamRef.current,
        mimeType ? { mimeType, ...RECORDING_OPTIONS } : RECORDING_OPTIONS
      );
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          if (!initSegmentRef.current) initSegmentRef.current = e.data;
          chunksRef.current.push(e.data);
        }
      };
      recorder.onerror = () => { recordingUnavailableRef.current = true; };
      recorder.start(1000);
      recorderRef.current = recorder;
    } catch {
      recordingUnavailableRef.current = true;
    }
  }

  function startRecordingForQuestion({ resetAnswer = true } = {}) {
    attachPreviewStream();
    shouldListenRef.current = true;
    interimTranscriptRef.current = "";
    if (resetAnswer) {
      setTranscriptValue("");
      setCodeResponse("");
    }
    setUploadError("");
    if (resetAnswer) startQuestionTimer();
    questionStartedAtMs.current = Date.now();
    startSpeechRecognition();
  }

  // Keep the self-preview visible across UI transitions and question changes.
  useEffect(() => {
    if (!cameraReady) return;
    attachPreviewStream();
  }, [attachPreviewStream, cameraReady, phase, currentIdx]);

  // Snapshot the accumulated chunks for the current question WITHOUT stopping the
  // recorder. The recorder keeps running so the next question always has video.
  function snapshotRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state !== "recording") {
        if (chunksRef.current.length > 0) {
          const init = initSegmentRef.current;
          const chunks = chunksRef.current;
          const chunksForBlob = init && chunks[0] !== init ? [init, ...chunks] : chunks;
          const type = chunksForBlob[0]?.type || "video/webm";
          const blob = new Blob(chunksForBlob, { type });
          chunksRef.current = [];
          resolve(blob.size > 0 ? blob : null);
        } else {
          resolve(null);
        }
        return;
      }

      // Grab all chunks accumulated so far immediately — these are the reliable bulk
      // (up to ~180 chunks after a 3-minute question at 1000ms interval).
      // We do this BEFORE calling requestData() because requestData() can disrupt
      // ondataavailable on Android WebView / older Safari, causing the wait below to
      // produce zero chunks and the whole snapshot to appear empty.
      const mainChunks = [...chunksRef.current];
      chunksRef.current = [];

      // requestData() flushes the last partial second that hasn't emitted yet.
      // Collect any tail chunks it produces in a short window.
      try { recorderRef.current.requestData(); } catch { /* ignore */ }
      setTimeout(() => {
        const tailChunks = [...chunksRef.current];
        chunksRef.current = [];

        const allChunks = [...mainChunks, ...tailChunks];
        if (allChunks.length === 0) {
          console.warn("[recording] snapshotRecording: no chunks for Q", currentIdxRef.current, "recorder:", recorderRef.current?.state);
          resolve(null);
          return;
        }
        // Q2+ blobs don't contain the WebM/MP4 init segment (container header) because
        // it was only emitted in the first ondataavailable event. Prepend it so the
        // browser can decode the video; skip if allChunks already starts with it (Q1).
        const init = initSegmentRef.current;
        const chunksForBlob = init && allChunks[0] !== init ? [init, ...allChunks] : allChunks;
        const type = recorderRef.current?.mimeType || chunksForBlob[0]?.type || "video/webm";
        const blob = new Blob(chunksForBlob, { type });
        resolve(blob.size > 0 ? blob : null);
      }, 400);
    });
  }

  // Stop speech recognition (called between questions and at interview end)
  function stopSpeechRecognition() {
    shouldListenRef.current = false;
    // Flush any pending interim transcript so it isn't lost if recognition stops mid-word.
    if (interimTranscriptRef.current) {
      setTranscriptValue((c) => `${c} ${interimTranscriptRef.current}`.replace(/\s+/g, " ").trim());
      interimTranscriptRef.current = "";
    }
    if (recognitionRestartTimerRef.current) {
      clearTimeout(recognitionRestartTimerRef.current);
      recognitionRestartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }

  // Fully stop the MediaRecorder at interview end
  function stopRecording(): Promise<Blob | null> {
    stopSpeechRecognition();
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state === "inactive") {
        resolve(null);
        return;
      }
      recorderRef.current.onstop = () => {
        const snappedChunks = [...chunksRef.current];
        chunksRef.current = [];
        if (snappedChunks.length === 0) { resolve(null); return; }
        const type = recorderRef.current?.mimeType || snappedChunks[0]?.type || "video/webm";
        const blob = new Blob(snappedChunks, { type });
        resolve(blob.size > 0 ? blob : null);
      };
      try { recorderRef.current.requestData(); } catch { /* ignore */ }
      recorderRef.current.stop();
    });
  }

  async function uploadCurrentQuestion({ restartOnFailure = true } = {}) {
    const q = questions[currentIdxRef.current];
    uploadingRef.current = true;
    setUploading(true);
    setUploadError("");

    try {
      stopSpeechRecognition();
      const blob = await snapshotRecording();
      const speechTranscript = `${transcriptRef.current} ${interimTranscriptRef.current}`.replace(/\s+/g, " ").trim();
      const cleanTranscript = speechTranscript;
      const cleanCodeResponse = codeResponse.trim();

      if (!blob && !recordingUnavailableRef.current) {
        setUploadError("Video recording was not captured. Keep camera and microphone allowed, stay on this screen, and retry before moving ahead.");
        if (restartOnFailure) startRecordingForQuestion({ resetAnswer: false });
        return false;
      }

      // Guard against unexpectedly large blobs before hitting the network.
      // At 150kbps a 3-minute clip should be ~3.2MB; 10MB is a safe ceiling.
      const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
      if (blob && blob.size > MAX_VIDEO_BYTES) {
        setUploadError(`Recording is too large to upload (${Math.round(blob.size / 1024 / 1024)}MB). Please try a different browser or contact your recruiter.`);
        if (restartOnFailure) startRecordingForQuestion({ resetAnswer: false });
        return false;
      }

      const formData = new FormData();
      formData.append("questionId", q.id);
      if (cleanTranscript) formData.append("transcript", cleanTranscript);
      if (cleanCodeResponse) formData.append("codeResponse", cleanCodeResponse);
      if (blob) {
        const extension = blob.type.includes("mp4") ? "mp4" : "webm";
        formData.append("video", blob, `${q.id}.${extension}`);
      }

      const uploadController = new AbortController();
      const uploadTimeout = setTimeout(() => uploadController.abort(), 40_000);
      let response: Response;
      try {
        response = await fetch(`/api/interview/${inviteToken}/upload`, { method: "POST", body: formData, signal: uploadController.signal });
      } finally {
        clearTimeout(uploadTimeout);
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message = typeof body?.error === "string" ? body.error : `Upload failed (${response.status})`;
        setUploadError(`${message}. Please retry before moving ahead.`);
        if (restartOnFailure) startRecordingForQuestion({ resetAnswer: false });
        return false;
      }

      return true;
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      setUploadError(
        isTimeout
          ? "Upload timed out — check your internet connection and retry."
          : "Upload failed because the network or server was unavailable. Please retry before moving ahead."
      );
      if (restartOnFailure) startRecordingForQuestion({ resetAnswer: false });
      return false;
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }

  async function submitInterview() {
    intentionalExitRef.current = true;
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    setPhase("done");
    // Retry once on network/5xx failure — a permanent failure leaves the test
    // IN_PROGRESS until the overnight cron rescues it, so one retry is worth it.
    let submitted = false;
    for (let attempt = 0; attempt < 2 && !submitted; attempt++) {
      if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/interview/${inviteToken}/submit`, { method: "POST" });
        submitted = res.ok || res.status === 400; // 400 = already completed, that's fine
      } catch { /* network error, will retry */ }
    }
    if (getFullscreenEl()) await exitFullscreenDoc().catch(() => undefined);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    router.push(`/interview/${inviteToken}/complete`);
  }

  async function handleNext() {
    if (uploadingRef.current || nextLockRef.current) return;
    nextLockRef.current = true;

    const timeSpentMs = Date.now() - questionStartedAtMs.current;
    const timeSpent = Math.floor(timeSpentMs / 1000);

    if (timeSpent < 15 && ["INTERMEDIATE", "ADVANCED", "PRACTICAL"].includes(level)) {
      logFraud("RAPID_ANSWER", "LOW", `Answered in ${timeSpent}s`);
    }

    const uploaded = await uploadCurrentQuestion();
    nextLockRef.current = false;
    if (!uploaded) return;

    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    if (currentIdx + 1 >= questions.length) {
      await submitInterview();
    } else {
      setCurrentIdx((i) => i + 1);
      startRecordingForQuestion();
    }
  }

  async function handleAutoSubmit() {
    if (autoSubmitStartedRef.current) return;
    autoSubmitStartedRef.current = true;
    clearInterval(timerRef.current!);
    if (questionTimerRef.current) clearInterval(questionTimerRef.current);
    if (!uploadingRef.current && phase === "interview") {
      // Best-effort upload for the last question — retry once if it fails so
      // the candidate's final answer isn't silently dropped.
      const uploaded = await uploadCurrentQuestion({ restartOnFailure: false });
      if (!uploaded) {
        await new Promise<void>((r) => setTimeout(r, 2000));
        await uploadCurrentQuestion({ restartOnFailure: false });
      }
    } else {
      await stopRecording();
    }
    await submitInterview();
  }

  // Fullscreen enforcement
  useEffect(() => {
    if (phase !== "interview") return;
    if (isMobileInterview) return;
    const handleFsChange = () => {
      if (!getFullscreenEl()) {
        setShowFullscreenOverlay(true);
        fullscreenExits.current += 1;
        recordProctoringViolation("FULLSCREEN_EXIT", `Fullscreen exited #${fullscreenExits.current}`);
      } else {
        setShowFullscreenOverlay(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMobileInterview]);

  // Tab/window/screen-change detection
  useEffect(() => {
    if (phase !== "interview") return;
    const logScreenOrTabChange = (reason: string) => {
      if (intentionalExitRef.current || proctoringTerminatedRef.current || autoSubmitStartedRef.current) return;
      const now = Date.now();
      if (now - lastAttentionEventAt.current < ATTENTION_EVENT_DEDUP_MS) return;

      lastAttentionEventAt.current = now;
      screenOrTabChanges.current += 1;
      recordProctoringViolation("SCREEN_OR_TAB_CHANGE", `${reason} #${screenOrTabChanges.current}`);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        logScreenOrTabChange("Interview tab hidden");
      }
    };
    const handleBlur = () => {
      logScreenOrTabChange("Interview window lost focus");
    };
    const handlePageHide = () => {
      logScreenOrTabChange("Interview page left");
    };

    document.addEventListener("visibilitychange", handleVisibility);
    if (!isMobileInterview) window.addEventListener("blur", handleBlur);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (!isMobileInterview) window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pagehide", handlePageHide);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMobileInterview]);

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
  const qmm = String(Math.floor(questionTimeLeft / 60)).padStart(2, "0");
  const qss = String(questionTimeLeft % 60).padStart(2, "0");
  const questionTimerCritical = questionTimeLeft <= 30;
  const questionTimerWarning = questionTimeLeft <= 60 && !questionTimerCritical;
  const q = questions[currentIdx];
  const isPractical = level === "PRACTICAL";
  const insecureCameraMessage =
    phase === "prechecks" && typeof window !== "undefined" && !window.isSecureContext
      ? "Camera access is blocked because this page is opened on a Not secure HTTP address. Use http://localhost:3000 on this laptop, or an HTTPS ngrok/cloudflared invite link for other devices."
      : "";
  const visibleCameraError = cameraError || insecureCameraMessage;
  const interviewRules = isMobileInterview ? MOBILE_RULES : RULES;

  // Pre-checks screen
  if (phase === "prechecks") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }}>
        <div className="glass-card max-w-2xl w-full p-8 animate-fade-in-up">
          {/* Branding */}
          <div className="flex items-center gap-3 mb-6">
            <BrandLogo size="sm" />
            <div>
              <h1 className="text-2xl font-bold text-white">Technical Interview Portal</h1>
              <p className="text-slate-400 text-sm">{candidateName} — {jobTitle} ({level})</p>
            </div>
          </div>

          {initialStatus === "IN_PROGRESS" && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-4">
              <p className="text-blue-300 text-sm font-medium">Your previous session was interrupted. Reconnect your camera below to resume — your progress so far has been saved.</p>
            </div>
          )}

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 mb-6">
            <h2 className="font-semibold text-amber-300 mb-3">Interview Rules</h2>
            <ul className="space-y-2">
              {interviewRules.map((r) => (
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
            {questions.length} questions • 3 min per question • 30-minute total limit • Chrome or Edge required
          </div>

          <button
            onClick={beginInterview}
            disabled={!agreed || !cameraReady}
            className="btn-primary w-full py-3 text-base"
          >
            Begin Interview
          </button>
          {!cameraReady && (
            <p className="mt-3 text-center text-sm text-red-400">
              Camera and microphone access must be granted before you can begin the interview.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Interview screen
  return (
    <div className="min-h-screen bg-[#0a0e1a] flex flex-col">
      {/* Candidate proctoring notice */}
      {showStartWarning && (
        <div className="fixed inset-0 z-[55] bg-black/80 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="glass-card max-w-md w-full p-8 text-center border border-amber-500/30 shadow-2xl shadow-amber-950/20 animate-fade-in-up">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-2xl font-black text-amber-300">
              !
            </div>
            <h2 className="text-2xl font-bold text-amber-200 mb-3">Stay on this interview screen</h2>
            <p className="text-sm leading-relaxed text-slate-200 mb-6">
              Changing tabs, switching windows, leaving fullscreen, or opening another app is detected and reported to the recruiter. Stay on this page for the full interview.
            </p>
            <button
              onClick={() => {
                setShowStartWarning(false);
                startTimer();
                startRecordingForQuestion();
                if (!isMobileInterview && !getFullscreenEl()) {
                  void requestFullscreenEl(document.documentElement).catch(() => undefined);
                }
              }}
              className="btn-primary w-full py-3"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {proctoringNotice && (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="glass-card max-w-md w-full p-8 text-center border border-red-500/30 shadow-2xl shadow-red-950/30 animate-fade-in-up">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-2xl font-black text-red-300">
              !
            </div>
            <h2 className="text-2xl font-bold text-red-300 mb-3">{proctoringNotice.title}</h2>
            <p className="text-sm leading-relaxed text-slate-200 mb-6">{proctoringNotice.message}</p>
            {proctoringNotice.terminal ? (
              <p className="text-xs font-medium uppercase tracking-wide text-red-200/80">Submitting interview...</p>
            ) : (
              <button
                onClick={() => {
                  setProctoringNotice(null);
                  if (!getFullscreenEl()) {
                    void requestFullscreenEl(document.documentElement).catch(() => undefined);
                  }
                }}
                className="btn-primary w-full py-3"
              >
                I Understand - Return to Interview
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen overlay */}
      {showFullscreenOverlay && !proctoringNotice && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center">
          <div className="glass-card p-8 max-w-sm text-center animate-fade-in-up">
            <h2 className="text-xl font-bold text-red-400 mb-2">Fullscreen Violation</h2>
            <p className="text-slate-300 mb-4">You have left fullscreen mode. This has been recorded. Please return to fullscreen to continue your interview.</p>
            <button
              onClick={() => requestFullscreenEl(document.documentElement).catch(() => undefined)}
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
          <BrandLogo size="sm" className="scale-75 origin-left" />
          <span className="text-sm font-medium">Question {currentIdx + 1} of {questions.length}</span>
        </div>
        <div className="flex items-center gap-4">
          {fraudCount > 0 && (
            <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/20">
              Integrity warning
            </span>
          )}
          {/* Per-question countdown */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider leading-none mb-0.5">This Q</span>
            <span
              className={`text-lg font-mono font-bold ${questionTimerCritical ? "text-red-400" : questionTimerWarning ? "text-amber-400" : "text-white"}`}
              style={questionTimerCritical ? { textShadow: "0 0 8px rgba(248,113,113,0.5)" } : {}}
            >
              {qmm}:{qss}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          {/* Total interview countdown */}
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider leading-none mb-0.5">Total</span>
            <span className={`text-sm font-mono font-semibold ${timeLeft < 300 ? "text-red-400" : "text-slate-400"}`}>
              {mm}:{ss}
            </span>
          </div>
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
            {/* Per-question progress bar */}
            <div className="mt-4 mb-2">
              <div className="flex justify-between text-xs mb-1">
                <span className={questionTimerCritical ? "text-red-400 font-semibold" : questionTimerWarning ? "text-amber-400" : "text-slate-500"}>
                  {questionTimerCritical ? "⚠ Time almost up!" : questionTimerWarning ? "Less than 1 min left" : "Time per question"}
                </span>
                <span className={`font-mono font-semibold ${questionTimerCritical ? "text-red-400" : questionTimerWarning ? "text-amber-400" : "text-slate-400"}`}>
                  {qmm}:{qss}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${questionTimerCritical ? "bg-red-500" : questionTimerWarning ? "bg-amber-400" : "bg-blue-500"}`}
                  style={{ width: `${(questionTimeLeft / QUESTION_SECONDS) * 100}%` }}
                />
              </div>
            </div>
            <button
              onClick={handleNext}
              disabled={uploading}
              className="btn-primary w-full py-3"
            >
              {uploading ? "Uploading…" : currentIdx + 1 >= questions.length ? "Submit Interview" : "Next Question"}
            </button>
            {uploadError && <p className="mt-3 text-sm text-red-300">{uploadError}</p>}
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
          {/* Per-question progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs mb-1">
              <span className={questionTimerCritical ? "text-red-400 font-semibold" : questionTimerWarning ? "text-amber-400" : "text-slate-500"}>
                {questionTimerCritical ? "⚠ Time almost up!" : questionTimerWarning ? "Less than 1 min left" : "Time per question"}
              </span>
              <span className={`font-mono font-semibold ${questionTimerCritical ? "text-red-400" : questionTimerWarning ? "text-amber-400" : "text-slate-400"}`}>
                {qmm}:{qss}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${questionTimerCritical ? "bg-red-500" : questionTimerWarning ? "bg-amber-400" : "bg-blue-500"}`}
                style={{ width: `${(questionTimeLeft / QUESTION_SECONDS) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={handleNext}
            disabled={uploading}
            className="btn-primary w-full py-3"
          >
            {uploading ? "Uploading…" : currentIdx + 1 >= questions.length ? "Submit Interview" : "Next Question →"}
          </button>
          {uploadError && <p className="mt-3 text-sm text-red-300 text-center">{uploadError}</p>}
        </div>
      )}
    </div>
  );
}
