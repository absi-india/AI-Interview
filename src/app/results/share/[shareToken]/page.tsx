import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { TestResultsClient } from "@/components/results/TestResultsClient";
import { getRecordingPlaybackPath } from "@/lib/recording";
import { BrandLogo } from "@/components/BrandLogo";

export default async function ShareResultsPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  const test = await prisma.test.findUnique({
    where: { shareToken },
    include: {
      candidate: true,
      questions: { orderBy: { order: "asc" } },
      fraudEvents: { orderBy: { occurredAt: "asc" } },
    },
  });

  if (!test) notFound();
  const testForClient = {
    ...test,
    questions: test.questions.map((question) => ({
      ...question,
      videoUrl: getRecordingPlaybackPath(question.id, question.videoUrl),
    })),
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <nav className="nav-absi px-6 py-4 flex items-center gap-3">
        <BrandLogo size="sm" />
        <h1 className="text-base font-bold text-white">Technical Interview Results</h1>
      </nav>
      <TestResultsClient test={JSON.parse(JSON.stringify(testForClient))} />
      <div className="text-center py-8 text-xs text-slate-600">
        Powered by Technical Interview Portal
      </div>
    </div>
  );
}
