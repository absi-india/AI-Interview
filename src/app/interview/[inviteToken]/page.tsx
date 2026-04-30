import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { InterviewExperience } from "@/components/interview/InterviewExperience";

type Question = {
  id: string;
  order: number;
  questionText: string;
  category: string;
  codeLanguageHint: string | null;
};

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  const decodedToken = decodeURIComponent(inviteToken).trim();
  const test = await prisma.test.findFirst({
    where: {
      OR: [
        { inviteToken: decodedToken },
        { inviteToken: { contains: decodedToken } },
        { inviteToken: { endsWith: decodedToken } },
      ],
    },
    include: {
      candidate: { select: { name: true } },
      questions: { orderBy: { order: "asc" }, select: { id: true, order: true, questionText: true, category: true, codeLanguageHint: true } },
    },
  });

  if (!test) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-red-600 mb-2">Invalid Link</h1>
          <p className="text-gray-600">This interview link is not valid.</p>
        </div>
      </div>
    );
  }

  if (test.inviteExpiresAt && test.inviteExpiresAt < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-orange-600 mb-2">Link Expired</h1>
          <p className="text-gray-600">This interview link has expired. Please contact your recruiter.</p>
        </div>
      </div>
    );
  }

  if (test.status === "COMPLETED") {
    redirect(`/interview/${test.inviteToken}/complete`);
  }

  if (!["INVITED", "IN_PROGRESS"].includes(test.status)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-700 mb-2">Interview Not Ready</h1>
          <p className="text-gray-600">This interview is not yet available.</p>
        </div>
      </div>
    );
  }

  return (
    <InterviewExperience
      inviteToken={test.inviteToken}
      candidateName={test.candidate.name}
      jobTitle={test.jobTitle}
      level={test.level}
      questions={test.questions as Question[]}
      initialStatus={test.status}
    />
  );
}
