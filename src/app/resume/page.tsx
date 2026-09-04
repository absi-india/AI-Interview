import { auth } from "@/auth";
import { canSeeRecruiting } from "@/lib/roles";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ResumeFormattingApp } from "@/components/resume/ResumeFormattingApp";

export const metadata = { title: "Resume Formatting · ABSI TIP" };

export default async function ResumeFormattingPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeRecruiting(session.user.role)) redirect("/payroll");

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      {/* Topbar (62px) to match the app chrome; editor sizes itself to the rest of the viewport. */}
      <header className="flex h-[62px] items-center justify-between gap-4 border-b border-[#e1e7f0] bg-white px-5 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <span className="text-[15px] font-semibold text-[#0f172a]">Resume Formatting</span>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a]">
          &larr; Back to dashboard
        </Link>
      </header>

      <main>
        <ResumeFormattingApp />
      </main>
    </div>
  );
}
