import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { SignOutButton } from "@/components/SignOutButton";
import { DeleteCandidateButton } from "@/components/DeleteCandidateButton";

const STATUS_LABEL: Record<string, string> = {
  QUESTIONS_PENDING: "Questions Pending",
  QUESTIONS_APPROVED: "Questions Approved",
  INVITED: "Invited",
  IN_PROGRESS: "In Progress",
  STOPPED_TAB_CHANGES: "Stopped - Tab Changes",
  COMPLETED: "Completed",
  EXPIRED: "Expired",
};

const STATUS_COLOR: Record<string, string> = {
  QUESTIONS_PENDING: "bg-[#fef3c7] text-[#b45309]",
  QUESTIONS_APPROVED: "bg-[#dbeafe] text-[#2563eb]",
  INVITED: "bg-[#e0e7ff] text-[#4f46e5]",
  IN_PROGRESS: "bg-[#dbeafe] text-[#2563eb]",
  STOPPED_TAB_CHANGES: "bg-[#fee2e2] text-[#dc2626]",
  COMPLETED: "bg-[#dcfce7] text-[#15803d]",
  EXPIRED: "bg-[#f1f5f9] text-[#64748b]",
};

const ATTENTION_EVENT_TYPES = [
  "SCREEN_OR_TAB_CHANGE",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
];
const MAX_PROCTORING_VIOLATIONS = 3;

function getDisplayStatus(status: string, attentionEventCount: number) {
  if (status === "IN_PROGRESS" && attentionEventCount >= MAX_PROCTORING_VIOLATIONS) {
    return "STOPPED_TAB_CHANGES";
  }
  return status;
}

function happenedDuringInterview(event: { occurredAt: Date }, completedAt: Date | null) {
  if (!completedAt) return true;
  return event.occurredAt.getTime() <= completedAt.getTime();
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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
  const initials = getInitials(displayName) || "U";
  const where = role === "ADMIN" ? {} : { recruiterId: session.user.id };
  const candidates = await prisma.candidate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      tests: {
        select: {
          id: true,
          status: true,
          jobTitle: true,
          createdAt: true,
          completedAt: true,
          fraudEvents: {
            where: { type: { in: ATTENTION_EVENT_TYPES } },
            select: { id: true, occurredAt: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  // Aggregate data for the overview chart + stat cards (respects recruiter scope)
  const tests = await prisma.test.findMany({
    where,
    select: { status: true, createdAt: true, completedAt: true, overallScore: true },
  });
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const completedThisMonth = tests.filter(
    (t) => t.status === "COMPLETED" && t.completedAt && new Date(t.completedAt) >= monthStart,
  ).length;
  const scored = tests.filter((t) => t.overallScore != null);
  const avgScoreFive = scored.length
    ? Math.round((scored.reduce((a, t) => a + (t.overallScore as number), 0) / scored.length / 2) * 10) / 10
    : 0;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const weekBuckets = new Array(8).fill(0) as number[];
  for (const t of tests) {
    const created = new Date(t.createdAt);
    created.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((dayStart.getTime() - created.getTime()) / 86_400_000);
    const weeksAgo = diffDays < 0 ? 0 : Math.floor(diffDays / 7);
    if (weeksAgo <= 7) weekBuckets[7 - weeksAgo] += 1;
  }
  const maxBucket = Math.max(1, ...weekBuckets);
  const totalRecentInterviews = weekBuckets.reduce((a, b) => a + b, 0);

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

  const navItems: { label: string; href: string | null; active?: boolean }[] = [
    { label: "Overview", href: "/dashboard", active: true },
    { label: "Activity", href: "/activity" },
    ...(role === "ADMIN" ? [{ label: "Admin Panel", href: "/admin" }] : []),
  ];

  return (
    <div className="min-h-screen flex" style={{ background: "#e9edf3" }}>
      {/* Sidebar */}
      <aside className="hidden lg:flex w-60 flex-none flex-col bg-white border-r border-[#e1e7f0] px-3.5 py-5">
        <div className="flex items-center gap-2 px-2.5 pb-5">
          <BrandLogo size="sm" />
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={`h-10 flex items-center gap-3 px-3 rounded-[9px] text-[13.5px] transition-colors ${
                  item.active
                    ? "bg-[#eff4ff] text-[#2563eb] font-semibold"
                    : "text-[#475569] font-medium hover:bg-[#f8fafc]"
                }`}
              >
                <span className={`w-[7px] h-[7px] rounded-[2px] ${item.active ? "bg-[#2563eb]" : "bg-[#cbd5e1]"}`} />
                {item.label}
              </Link>
            ) : (
              <span
                key={item.label}
                className="h-10 flex items-center gap-3 px-3 rounded-[9px] text-[13.5px] text-[#94a3b8] font-medium cursor-default"
              >
                <span className="w-[7px] h-[7px] rounded-[2px] bg-[#cbd5e1]" />
                {item.label}
              </span>
            ),
          )}
        </nav>
        <div className="mt-auto pt-3 border-t border-[#f0f2f6] flex items-center gap-2.5 px-1.5">
          <div className="w-9 h-9 rounded-full bg-[#dbeafe] text-[#2563eb] flex items-center justify-center font-semibold text-xs">{initials}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#0f172a] truncate">{displayName}</div>
            <div className="font-mono text-[10px] text-[#94a3b8] tracking-wide">{role}</div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-[62px] bg-white border-b border-[#e1e7f0] flex items-center justify-between gap-4 px-5 sm:px-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="lg:hidden flex-none"><BrandLogo size="sm" /></div>
            <form action="/dashboard" className="relative flex-1 max-w-[440px]">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
              <input
                type="search"
                name="q"
                defaultValue={searchQuery}
                placeholder="Search candidates by name, email, or phone"
                className="w-full h-10 pl-10 pr-4 text-[13.5px] text-[#0f172a] bg-[#f6f8fb] border border-[#e0e6ee] rounded-[10px] focus:outline-none focus:border-[#2563eb] focus:bg-white focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-colors"
              />
            </form>
          </div>
          <div className="flex items-center gap-3">
            {searchQuery && (
              <Link href="/dashboard" className="hidden sm:inline text-sm text-[#64748b] hover:text-[#334155] font-medium">Clear</Link>
            )}
            <Link href="/candidates/new" className="h-10 px-4 inline-flex items-center gap-1.5 bg-[#2563eb] hover:bg-[#1d4ed8] text-white rounded-[10px] text-[13.5px] font-semibold transition-colors">
              <span className="text-base leading-none">+</span> Add Candidate
            </Link>
          </div>
        </header>

        <main className="p-6 lg:p-7">
          <div className="mb-5">
            <h1 className="text-[22px] font-semibold tracking-tight text-[#0f172a]">Candidates</h1>
            <p className="text-sm text-[#64748b] mt-1">Search by name, email, or phone number.</p>
          </div>

          {/* Overview chart + stat cards */}
          <div className="grid gap-[18px] mb-[22px] lg:grid-cols-[2fr_1fr]">
            <div className="glass-card p-6">
              <div className="mono-eyebrow text-[11px] mb-1">Interviews · Last 8 weeks</div>
              <div className="text-xl font-bold tracking-tight text-[#0f172a] mb-5">{totalRecentInterviews}</div>
              <div className="flex items-end gap-3 h-[170px]">
                {weekBuckets.map((count, i) => {
                  const h = Math.max(4, Math.round((count / maxBucket) * 150));
                  const isLast = i === 7;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 justify-end">
                      <span className={`font-mono text-[10px] font-semibold ${isLast ? "text-[#2563eb]" : "text-[#cbd5e1]"}`}>{count}</span>
                      <div
                        className="w-full rounded-t-md animate-grow-bar"
                        style={{ height: `${h}px`, background: isLast ? "#2563eb" : "#bcd0f7", animationDelay: `${i * 55}ms` }}
                      />
                      <span className="font-mono text-[10px] text-[#94a3b8]">W{i + 1}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-col gap-[18px]">
              <div className="glass-card p-5">
                <div className="mono-eyebrow text-[11px] mb-3">Completed · This month</div>
                <div className="text-[30px] font-bold tracking-tight text-[#0f172a] leading-none">{completedThisMonth}</div>
              </div>
              <div className="glass-card p-5">
                <div className="mono-eyebrow text-[11px] mb-3">Avg AI Score</div>
                <div className="flex items-end gap-2 mb-2.5">
                  <span className="text-[30px] font-bold tracking-tight text-[#0f172a] leading-none">{avgScoreFive.toFixed(1)}</span>
                  <span className="text-[13px] text-[#94a3b8] font-semibold mb-0.5">/5</span>
                </div>
                <div className="h-[7px] bg-[#eef1f5] rounded overflow-hidden">
                  <div className="h-full bg-[#2563eb] rounded" style={{ width: `${(avgScoreFive / 5) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {candidates.length === 0 ? (
            <div className="text-center py-16 glass-card animate-fade-in-up">
              <p className="text-[#475569]">No candidates yet.</p>
              <Link href="/candidates/new" className="text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">Add your first candidate</Link>
            </div>
          ) : visibleCandidates.length === 0 ? (
            <div className="text-center py-12 glass-card animate-fade-in-up">
              <p className="text-[#0f172a] font-medium">No matching candidates</p>
              <p className="text-sm text-[#64748b] mt-1">Try a different name, email, or phone number.</p>
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
                    const attentionEventCount = latest?.fraudEvents.filter((event) =>
                      happenedDuringInterview(event, latest.completedAt)
                    ).length ?? 0;
                    const displayStatus = latest ? getDisplayStatus(latest.status, attentionEventCount) : "";
                    const attentionDisplay = Math.min(attentionEventCount, MAX_PROCTORING_VIOLATIONS);
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/candidates/${c.id}`} className="font-semibold text-[#2563eb] hover:text-[#1d4ed8] transition-colors">{c.name}</Link>
                          <div className="text-[#64748b] text-xs mt-0.5">{c.email}</div>
                          <div className="font-mono text-[#94a3b8] text-[11px] mt-0.5">{c.phone}</div>
                        </td>
                        <td className="text-[#334155]">{latest?.jobTitle ?? "—"}</td>
                        <td>
                          {latest ? (
                            <div className="flex flex-col items-start gap-1.5">
                              <span className={`badge ${STATUS_COLOR[displayStatus] ?? "bg-[#f1f5f9] text-[#64748b]"}`}>
                                {STATUS_LABEL[displayStatus] ?? displayStatus}
                              </span>
                              {attentionEventCount > 0 && (
                                <span className="badge bg-[#fee2e2] text-[#dc2626]">
                                  Screen/tab changes: {attentionDisplay}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#94a3b8] text-xs">No tests</span>
                          )}
                        </td>
                        <td>
                          <div className="flex gap-3.5">
                            <Link href={`/candidates/${c.id}`} className="text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">View</Link>
                            <Link href={`/tests/new?candidateId=${c.id}`} className="text-[#475569] hover:text-[#0f172a] font-medium transition-colors">Schedule</Link>
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
    </div>
  );
}
