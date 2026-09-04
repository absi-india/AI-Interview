import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { SignOutButton } from "@/components/SignOutButton";
import { PayrollApp } from "@/components/payroll/PayrollApp";
import { canSeePayroll, canSeeRecruiting, ROLE_LABEL, type Role } from "@/lib/roles";

export const metadata = { title: "Payslips · ABSI" };

/** Salary, PAN and bank details: accounts and administrators only. */
export default async function PayrollPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeePayroll(session.user.role)) redirect("/dashboard");

  const role = session.user.role;
  const displayName = session.user.name ?? session.user.email ?? "Account";

  // Accounts staff see only what is theirs; an administrator keeps the rest.
  const navItems = [
    ...(canSeeRecruiting(role) ? [{ label: "Overview", href: "/dashboard" }] : []),
    ...(canSeeRecruiting(role) ? [{ label: "Activity", href: "/activity" }] : []),
    ...(canSeeRecruiting(role) ? [{ label: "Resume Formatting", href: "/resume" }] : []),
    { label: "Payslips", href: "/payroll", active: true },
    ...(role === "ADMIN" ? [{ label: "Admin Panel", href: "/admin" }] : []),
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "#e9edf3" }}>
      <aside className="hidden lg:flex w-60 flex-none flex-col bg-[#0f172a] border-r border-[#1e293b] px-3.5 py-5">
        <div className="flex items-center gap-2 px-2.5 pb-5">
          <BrandLogo size="sm" />
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`h-10 flex items-center gap-3 px-3 rounded-[9px] text-[13.5px] transition-colors ${
                item.active
                  ? "bg-[#0d9488]/15 text-[#2dd4bf] font-semibold"
                  : "text-[#94a3b8] font-medium hover:bg-white/5 hover:text-[#e2e8f0]"
              }`}
            >
              <span className={`w-[7px] h-[7px] rounded-[2px] ${item.active ? "bg-[#2dd4bf]" : "bg-[#475569]"}`} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t border-[#1e293b] pt-4">
          <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#1e293b] text-[12px] font-semibold text-[#94a3b8]">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{displayName}</div>
            <div className="font-mono text-[10px] tracking-wide text-[#64748b]">
              {ROLE_LABEL[role as Role] ?? role}
            </div>
          </div>
          <SignOutButton className="text-xs font-medium text-[#94a3b8] transition-colors hover:text-[#f87171]" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[62px] flex-none items-center justify-between gap-4 border-b border-[#e1e7f0] bg-white px-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="lg:hidden"><BrandLogo size="sm" /></div>
            <span className="text-[15px] font-semibold text-[#0f172a]">Payslips</span>
          </div>
          <span className="hidden text-sm text-[#64748b] sm:inline">ABS InfoTech Pvt Ltd</span>
        </header>
        <main className="min-h-0 flex-1">
          <PayrollApp />
        </main>
      </div>
    </div>
  );
}
