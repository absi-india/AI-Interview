import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isHttpUrl, parseResumeFileRef } from "@/lib/resume";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { DeleteCandidateButton } from "@/components/DeleteCandidateButton";

const STATUS_COLOR: Record<string, string> = {
  QUESTIONS_PENDING: "bg-[#fef3c7] text-[#b45309]",
  INVITED: "bg-[#e0e7ff] text-[#4f46e5]",
  IN_PROGRESS: "bg-[#dbeafe] text-[#2563eb]",
  COMPLETED: "bg-[#dcfce7] text-[#15803d]",
  EXPIRED: "bg-[#f1f5f9] text-[#64748b]",
};

function scoreOutOfFive(score: number) {
  return Math.round((score / 2) * 10) / 10;
}

export default async function CandidateProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      tests: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!candidate) notFound();
  if (session.user.role !== "ADMIN" && candidate.recruiterId !== session.user.id) {
    redirect("/dashboard");
  }
  const resumeFile = parseResumeFileRef(candidate.resumeUrl);
  const resumeHref = resumeFile
    ? resumeFile.provider === "local"
      ? resumeFile.objectKey
      : `/api/candidates/${candidate.id}/resume`
    : null;

  return (
    <div className="min-h-screen p-8" style={{ background: "#f4f6f9" }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 animate-fade-in">
          <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="glass-card p-6 mb-6 animate-fade-in-up">
          <div className="flex justify-between items-start gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a]">{candidate.name}</h1>
              <p className="text-[#64748b] mt-1">{candidate.email} · <span className="font-mono text-[13px]">{candidate.phone}</span></p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Link
                href={`/tests/new?candidateId=${candidate.id}`}
                className="btn-primary text-sm"
              >
                Schedule Test
              </Link>
              <Link href={`/candidates/${candidate.id}/edit`} className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">
                Edit Candidate
              </Link>
              <DeleteCandidateButton
                candidateId={candidate.id}
                candidateName={candidate.name}
                redirectTo="/dashboard"
              />
            </div>
          </div>

          {candidate.resumeUrl && (
            <div className="mt-5 border-t border-[#f0f2f6] pt-4">
              <h3 className="text-sm font-semibold text-[#0f172a] mb-2">Resume</h3>
              {resumeFile ? (
                <a
                  href={resumeHref ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[#2563eb] hover:text-[#1d4ed8] break-all transition-colors inline-flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download {resumeFile.fileName}
                </a>
              ) : isHttpUrl(candidate.resumeUrl) ? (
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[#2563eb] hover:text-[#1d4ed8] break-all transition-colors"
                >
                  {candidate.resumeUrl}
                </a>
              ) : (
                <p className="text-sm text-[#475569] whitespace-pre-wrap">{candidate.resumeUrl}</p>
              )}
            </div>
          )}
        </div>

        <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Test History</h2>
        {candidate.tests.length === 0 ? (
          <p className="text-[#64748b] text-sm">No tests yet.</p>
        ) : (
          <div className="space-y-3 stagger">
            {candidate.tests.map((test) => (
              <div key={test.id} className="glass-card p-4 flex justify-between items-center animate-fade-in-up hover:border-[#2563eb]/30 transition-colors">
                <div>
                  <p className="font-semibold text-[#0f172a]">{test.jobTitle}</p>
                  <p className="font-mono text-xs text-[#94a3b8] mt-0.5">{test.level} · {new Date(test.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`badge ${STATUS_COLOR[test.status] ?? "bg-[#f1f5f9] text-[#64748b]"}`}>
                    {test.status.replace(/_/g, " ")}
                  </span>
                  {test.status === "QUESTIONS_PENDING" && (
                    <Link href={`/tests/${test.id}/review-questions`} className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">Review</Link>
                  )}
                  {test.status === "INVITED" && (
                    <Link href={`/tests/${test.id}/review-questions`} className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">Resend Invite</Link>
                  )}
                  {["COMPLETED", "IN_PROGRESS"].includes(test.status) && (
                    <Link href={`/tests/${test.id}`} className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">Results</Link>
                  )}
                  {test.overallScore !== null && (
                    <span className="font-mono font-bold text-[#15803d]">{scoreOutOfFive(test.overallScore).toFixed(1)}/5</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
