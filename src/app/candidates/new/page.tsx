"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";

const MAX_RESUME_SIZE_BYTES = 10 * 1024 * 1024;

function getErrorFromResponseText(text: string) {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    // Ignore JSON parse errors and fall back to plain text.
  }

  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, 180) : "";
}

function tryParseJson<T>(text: string) {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export default function NewCandidatePage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", phone: "", resume: "" });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const resumePreviewUrlRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (resumePreviewUrlRef.current) URL.revokeObjectURL(resumePreviewUrlRef.current);
    };
  }, []);

  function handleResumeFileChange(file: File | null) {
    if (resumePreviewUrlRef.current) {
      URL.revokeObjectURL(resumePreviewUrlRef.current);
      resumePreviewUrlRef.current = null;
    }

    setResumeFile(file);

    if (!file) {
      setResumePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    resumePreviewUrlRef.current = objectUrl;
    setResumePreviewUrl(objectUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (resumeFile && resumeFile.size > MAX_RESUME_SIZE_BYTES) {
      setError("Resume file is too large (max 10MB)");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const createText = await res.text();
      const createError = getErrorFromResponseText(createText);
      const createData = tryParseJson<{ candidate?: { id: string } }>(createText) ?? {};

      if (!res.ok) {
        setError(createError || "Failed to create candidate");
        return;
      }

      const candidateId = createData.candidate?.id;
      if (!candidateId) {
        setError("Candidate created but response was incomplete");
        return;
      }

      if (resumeFile) {
        const uploadData = new FormData();
        uploadData.append("file", resumeFile);

        const uploadRes = await fetch(`/api/candidates/${candidateId}/resume`, {
          method: "POST",
          body: uploadData,
        });
        const uploadText = await uploadRes.text();
        const uploadError = getErrorFromResponseText(uploadText);

        if (!uploadRes.ok) {
          setError(uploadError || `Candidate created but resume upload failed (HTTP ${uploadRes.status})`);
          return;
        }
      }

      router.push(`/candidates/${candidateId}`);
    } catch {
      setError("Network error while creating candidate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen p-8" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <div className="mx-auto max-w-xl">
        <div className="mb-6 animate-fade-in">
          <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </Link>
        </div>
        <div className="glass-card p-8 animate-fade-in-up">
          <h1 className="mb-6 text-xl font-bold text-white">Add Candidate</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Full Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="input-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
                className="input-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Phone *</label>
              <CountryPhoneInput
                value={form.phone}
                onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Resume (paste text or URL)</label>
              <textarea
                value={form.resume}
                onChange={(e) => setForm((f) => ({ ...f, resume: e.target.value }))}
                rows={6}
                placeholder="Optional: paste resume text or a resume link"
                className="input-dark"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Resume Attachment (PDF, DOC, DOCX, PPT, PPTX, TXT, RTF, ODT)
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.odt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/rtf,application/vnd.oasis.opendocument.text"
                onChange={(e) => handleResumeFileChange(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600/20 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-400 hover:file:bg-blue-600/30 transition-colors"
              />
              <p className="mt-1 text-xs text-slate-500">Max size: 10MB</p>
              {resumeFile && (
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-blue-400">Selected: {resumeFile.name}</span>
                  {resumePreviewUrl && (
                    <a
                      href={resumePreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline transition-colors"
                    >
                      Open selected resume
                    </a>
                  )}
                </div>
              )}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading ? "Saving..." : "Add Candidate"}
              </button>
              <Link
                href="/dashboard"
                className="btn-secondary"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
