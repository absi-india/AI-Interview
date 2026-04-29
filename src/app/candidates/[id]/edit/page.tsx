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
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href={`/candidates/${candidateId}`} className="text-sm text-blue-600 hover:underline">
            Back to candidate
          </Link>
        </div>

        <div className="bg-white rounded-xl shadow p-8">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Edit Candidate</h1>
          <p className="text-sm text-gray-500 mb-6">
            Update contact details and paste resume text or a resume URL.
          </p>

          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                <CountryPhoneInput
                  value={form.phone}
                  onChange={(phone) => setForm((f) => ({ ...f, phone }))}
                  required
                  inputClassName="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  selectClassName="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resume (paste text or URL)</label>
                <textarea
                  value={form.resume}
                  onChange={(e) => {
                    setResumeTouched(true);
                    setForm((f) => ({ ...f, resume: e.target.value }));
                  }}
                  rows={8}
                  placeholder="Paste candidate resume content here, or paste a resume link"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Resume Attachment (PDF, DOC, DOCX, PPT, PPTX, TXT, RTF, ODT)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.odt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/rtf,application/vnd.oasis.opendocument.text"
                  onChange={(e) => handleResumeFileChange(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-gray-700"
                />
                <p className="text-xs text-gray-500 mt-1">Max size: 10MB</p>
                {resumeFile && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="text-blue-700">Selected: {resumeFile.name}</span>
                    {resumePreviewUrl && (
                      <a
                        href={resumePreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        Open selected resume
                      </a>
                    )}
                  </div>
                )}
                {!resumeFile && resumeFileName && (
                  <p className="text-xs text-gray-600 mt-1">
                    Current file:{" "}
                    {resumeDownloadPath ? (
                      <a
                        href={resumeDownloadPath}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 underline"
                      >
                        {resumeFileName}
                      </a>
                    ) : (
                      resumeFileName
                    )}
                  </p>
                )}
              </div>

              {error && <p className="text-red-600 text-sm">{error}</p>}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400 disabled:text-white disabled:opacity-100"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <Link
                  href={`/candidates/${candidateId}`}
                  className="px-6 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
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
