import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { PayrollApp } from "@/components/payroll/PayrollApp";

export const metadata = { title: "Payslips · ABSI" };

/** Salary, PAN and bank details: accounts and admins only. */
export default async function PayrollPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "ACCOUNTS") {
    return (
      <div className="min-h-screen bg-[#f4f6f9]">
        <header className="flex h-[62px] items-center justify-between gap-4 border-b border-[#e1e7f0] bg-white px-5 sm:px-6">
          <BrandLogo size="sm" />
          <Link href="/dashboard" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a]">
            &larr; Back to dashboard
          </Link>
        </header>
        <main className="mx-auto max-w-lg p-10 text-center">
          <h1 className="text-[19px] font-semibold text-[#0f172a]">Payroll is restricted</h1>
          <p className="mt-2 text-sm text-[#64748b]">
            Payslips contain salary and bank details, so only the accounts team and administrators can open this
            section. Ask an administrator if you need access.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f4f6f9]">
      <header className="flex h-[62px] items-center justify-between gap-4 border-b border-[#e1e7f0] bg-white px-5 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <span className="text-[15px] font-semibold text-[#0f172a]">Payslips</span>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-[#64748b] hover:text-[#0f172a]">
          &larr; Back to dashboard
        </Link>
      </header>
      <main>
        <PayrollApp />
      </main>
    </div>
  );
}
