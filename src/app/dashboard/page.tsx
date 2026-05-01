import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";
import { DeleteCandidateButton } from "@/components/DeleteCandidateButton";

const STATUS_LABEL: Record<string, string> = {
  QUESTIONS_PENDING: "Questions Pending",
  QUESTIONS_APPROVED: "Questions Approved",
  INVITED: "Invited",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
};

const STATUS_COLOR: Record<string, string> = {
  QUESTIONS_PENDING: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
  QUESTIONS_APPROVED: "bg-blue-500/15 text-blue-300 border border-blue-500/20",
  INVITED: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20",
  IN_PROGRESS: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
  COMPLETED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
  EXPIRED: "bg-slate-500/15 text-slate-400 border border-slate-500/20",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, role: true },
  });
  if (!currentUser) redirect("/login");

  const displayName = currentUser.name || currentUser.email || session.user.name || "User";
  const role = currentUser.role;
  const where = role === "ADMIN" ? {} : { recruiterId: session.user.id };
  const candidates = await prisma.candidate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      tests: { select: { id: true, status: true, jobTitle: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const qParam = (await searchParams).q;
  const searchQuery = (Array.isArray(qParam) ? qParam[0] : qParam)?.trim() ?? "";
  const normalizedSearch = searchQuery.toLowerCase();
  const visibleCandidates = normalizedSearch
    ? candidates.filter((candidate) => {
        const searchable = `${candidate.name} ${candidate.email} ${candidate.phone}`.toLowerCase();
        const digitsOnly = candidate.phone.replace(/\D/g, "");
        const queryDigits = normalizedSearch.replace(/\D/g, "");
        return (
          searchable.includes(normalizedSearch) ||
          (queryDigits.length > 0 && digitsOnly.includes(queryDigits))
        );
      })
    : candidates;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      {/* Nav */}
      <nav className="nav-absi px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-sm font-black text-white">A</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-tight">ABSI <span className="text-slate-400 font-normal text-sm">Interview Portal</span></h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            {displayName}
            <span className="ml-1.5 badge bg-blue-500/15 text-blue-300 border border-blue-500/20 text-xs">{role}</span>
          </span>
          {role === "ADMIN" && (
            <Link href="/admin" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">Admin Panel</Link>
          )}
          <SignOutButton />
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col gap-4 mb-6 animate-fade-in sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Candidates</h2>
            <p className="text-sm text-slate-500 mt-1">Search by name, email, or phone number.</p>
          </div>
          <Link
            href="/candidates/new"
            className="btn-primary flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Candidate
          </Link>
        </div>

        <form action="/dashboard" className="mb-5 grid gap-3 animate-fade-in sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={searchQuery}
              placeholder="Search candidates by name, email, or +1 phone"
              className="input-dark pl-10"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-5">Search</button>
            {searchQuery && (
              <Link href="/dashboard" className="btn-secondary px-5">
                Clear
              </Link>
            )}
          </div>
        </form>

        {candidates.length === 0 ? (
          <div className="text-center py-16 glass-card animate-fade-in-up">
            <div className="text-4xl mb-4">👤</div>
            <p className="text-slate-400">No candidates yet.</p>
            <Link href="/candidates/new" className="text-blue-400 hover:text-blue-300 font-medium transition-colors">Add your first candidate</Link>
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div className="text-center py-12 glass-card animate-fade-in-up">
            <p className="text-slate-300 font-medium">No matching candidates</p>
            <p className="text-sm text-slate-500 mt-1">Try a different name, email, or phone number.</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden animate-fade-in-up">
            <table className="w-full text-sm table-dark">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Latest Test</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCandidates.map((c) => {
                  const latest = c.tests[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/candidates/${c.id}`} className="font-medium text-white hover:text-blue-400 transition-colors">{c.name}</Link>
                        <div className="text-slate-500 text-xs mt-0.5">{c.email}</div>
                        <div className="text-slate-600 text-xs mt-0.5">{c.phone}</div>
                      </td>
                      <td className="text-slate-400">{latest?.jobTitle ?? "—"}</td>
                      <td>
                        {latest ? (
                          <span className={`badge ${STATUS_COLOR[latest.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                            {STATUS_LABEL[latest.status] ?? latest.status}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">No tests</span>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-3">
                          <Link href={`/candidates/${c.id}`} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">View</Link>
                          <Link href={`/tests/new?candidateId=${c.id}`} className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">Schedule Test</Link>
                          <DeleteCandidateButton candidateId={c.id} candidateName={c.name} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
