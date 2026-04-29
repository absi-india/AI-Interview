import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { TestResultsClient } from "@/components/results/TestResultsClient";
import { getRecordingPlaybackPath } from "@/lib/recording";

export default async function TestResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string | string[] }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const test = await prisma.test.findUnique({
    where: { id },
    include: {
      candidate: true,
      questions: { orderBy: { order: "asc" } },
      fraudEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!test) notFound();
  if (session.user.role !== "ADMIN" && test.recruiterId !== session.user.id) {
    redirect("/dashboard");
  }

  const shareUrl = `${process.env.APP_DOMAIN ?? "http://localhost:3000"}/results/share/${test.shareToken}`;
  const inviteParam = (await searchParams).invite;
  const inviteStatus = Array.isArray(inviteParam) ? inviteParam[0] : inviteParam;
  const testForClient = {
    ...test,
    questions: test.questions.map((question) => ({
      ...question,
      videoUrl: getRecordingPlaybackPath(question.id, question.videoUrl),
    })),
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <nav className="nav-absi flex items-center justify-between px-6 py-4">
        <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Dashboard
        </Link>
        <div className="flex items-center gap-4">
          {["QUESTIONS_PENDING", "INVITED"].includes(test.status) && (
            <Link
              href={`/tests/${id}/review-questions`}
              className="rounded-lg bg-amber-500/15 border border-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-500/25 transition-colors"
            >
              {test.status === "INVITED" ? "Resend Invite" : "Review Questions"}
            </Link>
          )}
        </div>
      </nav>
      {(inviteStatus === "sent" || inviteStatus === "resent") && (
        <div className="mx-6 mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 animate-fade-in">
          {inviteStatus === "resent"
            ? "Invite email resent successfully."
            : "Invite email sent successfully."}
        </div>
      )}
      <TestResultsClient test={JSON.parse(JSON.stringify(testForClient))} shareUrl={shareUrl} />
    </div>
  );
}
