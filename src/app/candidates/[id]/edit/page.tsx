"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CountryPhoneInput } from "@/components/CountryPhoneInput";

type Candidate = {
  id: string;
  name: string;
  email: string;
  phone: string;
  resumeUrl: string | null;
  resumeText?: string;
  resumeFileName?: string | null;
  resumeDownloadPath?: string | null;
};

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

export default function EditCandidatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const candidateId = useMemo(() => params?.id ?? "", [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resumeTouched, setResumeTouched] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePreviewUrl, setResumePreviewUrl] = useState<string | null>(null);
  const resumePreviewUrlRef = useRef<string | null>(null);
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumeDownloadPath, setResumeDownloadPath] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    resume: "",
  });

  useEffect(() => {
    if (!candidateId) return;
    fetch(`/api/candidates/${candidateId}`)
      .then((r) => r.json())
      .then((data) => {
        const candidate = data?.candidate as Candidate | undefined;
        if (!candidate) {
          setError("Candidate not found");
          return;
        }

        setForm({
          name: candidate.name ?? "",
          email: candidate.email ?? "",
          phone: candidate.phone ?? "",
          resume: candidate.resumeText ?? candidate.resumeUrl ?? "",
        });
        setResumeFileName(candidate.resumeFileName ?? null);
        setResumeDownloadPath(candidate.resumeDownloadPath ?? null);
      })
      .catch(() => setError("Failed to load candidate"))
      .finally(() => setLoading(false));
  }, [candidateId]);

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
    if (!candidateId) return;
    if (resumeFile && resumeFile.size > MAX_RESUME_SIZE_BYTES) {
      setError("Resume file is too large (max 10MB)");
      return;
    }

    setSaving(true);
    setError("");

    const payload: { name: string; email: string; phone: string; resume?: string } = {
      name: form.name,
      email: form.email,
      phone: form.phone,
    };

    if (resumeTouched) {
      payload.resume = form.resume;
    }

    const res = await fetch(`/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const updateText = await res.text();
    const updateError = getErrorFromResponseText(updateText);
    const data = tryParseJson<{ error?: unknown }>(updateText) ?? {};

    if (!res.ok) {
      setSaving(false);
      setError(updateError || (typeof data.error === "string" ? data.error : "Failed to update candidate"));
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
      const uploadJson = tryParseJson<{ error?: unknown }>(uploadText) ?? {};
      if (!uploadRes.ok) {
        setSaving(false);
        setError(
          uploadError || (typeof uploadJson.error === "string"
            ? uploadJson.error
            : `Failed to upload resume (HTTP ${uploadRes.status})`)
        );
        return;
      }
    }

    setSaving(false);
    router.push(`/candidates/${candidateId}`);
  }

  return (
    <div className="min-h-screen p-8" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 animate-fade-in">
          <Link href={`/candidates/${candidateId}`} className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
            Back to candidate
          </Link>
        </div>

        <div className="glass-card p-8 animate-fade-in-up">
          <h1 className="text-xl font-bold text-white mb-2">Edit Candidate</h1>
          <p className="text-sm text-slate-400 mb-6">
            Update contact details and paste resume text or a resume URL.
          </p>

          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Phone *</label>
                <CountryPhoneInput
                  value={form.phone}
                  onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                  required
                  inputClassName="input-dark"
                  selectClassName="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Resume (paste text or URL)</label>
                <textarea
                  value={form.resume}
                  onChange={(e) => {
                    setResumeTouched(true);
                    setForm((f) => ({ ...f, resume: e.target.value }));
                  }}
                  rows={8}
                  placeholder="Paste candidate resume content here, or paste a resume link"
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Resume Attachment (PDF, DOC, DOCX, PPT, PPTX, TXT, RTF, ODT)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.odt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/rtf,application/vnd.oasis.opendocument.text"
                  onChange={(e) => handleResumeFileChange(e.target.files?.[0] ?? null)}
                  className="input-dark file:mr-3 file:rounded-lg file:border-0 file:bg-blue-500/15 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-200 hover:file:bg-blue-500/25"
                />
                <p className="text-xs text-slate-500 mt-1">Max size: 10MB</p>
                {resumeFile && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-blue-300">Selected: {resumeFile.name}</span>
                    {resumePreviewUrl && (
                      <a
                        href={resumePreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        Open selected resume
                      </a>
                    )}
                  </div>
                )}
                {!resumeFile && resumeFileName && (
                  <p className="text-xs text-slate-400 mt-1">
                    Current file:{" "}
                    {resumeDownloadPath ? (
                      <a
                        href={resumeDownloadPath}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline"
                      >
                        {resumeFileName}
                      </a>
                    ) : (
                      resumeFileName
                    )}
                  </p>
                )}
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <Link
                  href={`/candidates/${candidateId}`}
                  className="btn-secondary"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
