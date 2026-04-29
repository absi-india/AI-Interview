import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isHttpUrl, parseResumeFileRef } from "@/lib/resume";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { DeleteCandidateButton } from "@/components/DeleteCandidateButton";

const STATUS_COLOR: Record<string, string> = {
  QUESTIONS_PENDING: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
  INVITED: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20",
  IN_PROGRESS: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  EXPIRED: "bg-slate-500/15 text-slate-400 border border-slate-500/20",
};

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
    <div className="min-h-screen p-8" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 animate-fade-in">
          <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="glass-card p-6 mb-6 animate-fade-in-up">
          <div className="flex justify-between items-start gap-6">
            <div>
              <h1 className="text-2xl font-bold text-white">{candidate.name}</h1>
              <p className="text-slate-400 mt-1">{candidate.email} · {candidate.phone}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Link
                href={`/tests/new?candidateId=${candidate.id}`}
                className="btn-primary text-sm"
              >
                Schedule Test
              </Link>
              <Link href={`/candidates/${candidate.id}/edit`} className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
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
            <div className="mt-5 border-t border-white/5 pt-4">
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Resume</h3>
              {resumeFile ? (
                <a
                  href={resumeHref ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 break-all transition-colors inline-flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download {resumeFile.fileName}
                </a>
              ) : isHttpUrl(candidate.resumeUrl) ? (
                <a
                  href={candidate.resumeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-300 break-all transition-colors"
                >
                  {candidate.resumeUrl}
                </a>
              ) : (
                <p className="text-sm text-slate-400 whitespace-pre-wrap">{candidate.resumeUrl}</p>
              )}
            </div>
          )}
        </div>

        <h2 className="text-lg font-semibold text-white mb-3">Test History</h2>
        {candidate.tests.length === 0 ? (
          <p className="text-slate-500 text-sm">No tests yet.</p>
        ) : (
          <div className="space-y-3 stagger">
            {candidate.tests.map((test) => (
              <div key={test.id} className="glass-card p-4 flex justify-between items-center animate-fade-in-up hover:border-blue-500/20 transition-colors">
                <div>
                  <p className="font-medium text-white">{test.jobTitle}</p>
                  <p className="text-xs text-slate-500">{test.level} · {new Date(test.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`badge ${STATUS_COLOR[test.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                    {test.status.replace(/_/g, " ")}
                  </span>
                  {test.status === "QUESTIONS_PENDING" && (
                    <Link href={`/tests/${test.id}/review-questions`} className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">Review</Link>
                  )}
                  {test.status === "INVITED" && (
                    <Link href={`/tests/${test.id}/review-questions`} className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">Resend Invite</Link>
                  )}
                  {["COMPLETED", "IN_PROGRESS"].includes(test.status) && (
                    <Link href={`/tests/${test.id}`} className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">Results</Link>
                  )}
                  {test.overallScore !== null && (
                    <span className="font-bold text-white">{test.overallScore?.toFixed(1)}/10</span>
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
