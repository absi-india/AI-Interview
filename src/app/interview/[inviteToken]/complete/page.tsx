import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/BrandLogo";

export default async function CompletePage({
  params,
}: {
  params: Promise<{ inviteToken: string }>;
}) {
  const { inviteToken } = await params;
  const decodedToken = decodeURIComponent(inviteToken).trim();

  const test = await prisma.test.findFirst({
    where: { inviteToken: decodedToken, status: "COMPLETED" },
    select: { id: true },
  });

  if (!test) {
    // Token invalid, not found, or interview not yet completed — send them back.
    redirect(`/interview/${inviteToken}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(180deg, #f7f9fc 0%, #eaeff6 100%)" }}>
      <div className="max-w-lg w-full text-center rounded-[18px] border border-[#e3e8ef] bg-white p-12 shadow-[0_20px_60px_-18px_rgba(15,23,42,0.22)] animate-fade-in-up">
        <div className="inline-flex items-center justify-center w-[66px] h-[66px] rounded-full bg-[#dcfce7] mb-6">
          <svg className="w-9 h-9 text-[#16a34a]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0f172a] mb-2.5">Interview Submitted!</h1>
        <p className="text-[#64748b] leading-relaxed">
          Thank you! Your interview has been submitted successfully. The recruiter will review your responses and be in touch soon.
        </p>
        <p className="font-mono text-xs text-[#94a3b8] mt-3">
          Any questions you did not reach will not count against your score.
        </p>
        <div className="mt-7 pt-6 border-t border-[#f0f2f6] flex justify-center">
          <BrandLogo size="sm" />
        </div>
      </div>
    </div>
  );
}
