import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { homePathFor } from "@/lib/roles";

export const metadata = { title: "Your account · ABSI" };

/** Reachable by anyone signed in, whatever they are allowed to see elsewhere. */
export default async function AccountPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="flex h-[62px] items-center justify-between gap-4 border-b border-[#e1e7f0] bg-white px-5 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <span className="text-[15px] font-semibold text-[#0f172a]">Your account</span>
        </div>
        <Link
          href={homePathFor(session.user.role)}
          className="text-sm font-medium text-[#64748b] hover:text-[#0f172a]"
        >
          &larr; Back
        </Link>
      </header>
      <main className="p-6 lg:p-7">
        <ChangePasswordForm />
      </main>
    </div>
  );
}
