import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { buildAppDomain } from "@/lib/mailer";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { SignOutButton } from "@/components/SignOutButton";
import { BrandLogo } from "@/components/BrandLogo";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

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

const ATTENTION_EVENT_TYPES = [
  "SCREEN_OR_TAB_CHANGE",
  "TAB_SWITCH",
  "WINDOW_BLUR",
  "FULLSCREEN_EXIT",
];

function formatDate(value: Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatScore(score: number | null) {
  if (score === null) return "-";
  return `${(Math.round((score / 2) * 10) / 10).toFixed(1)}/5`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!currentUser) redirect("/login");

  const params = await searchParams;
  const qParam = params.q;
  const statusParam = params.status;
  const searchQuery = (Array.isArray(qParam) ? qParam[0] : qParam)?.trim() ?? "";
  const statusFilter = (Array.isArray(statusParam) ? statusParam[0] : statusParam)?.trim() ?? "ALL";

  const tests = await prisma.test.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      candidate: { select: { id: true, name: true, email: true, phone: true } },
      recruiter: { select: { id: true, name: true, email: true } },
      questions: { select: { id: true } },
      fraudEvents: {
        where: { type: { in: ATTENTION_EVENT_TYPES } },
        select: { id: true, severity: true },
      },
    },
  });

  const normalizedSearch = searchQuery.toLowerCase();
  const visibleTests = tests.filter((test) => {
    const matchesStatus = statusFilter === "ALL" || test.status === statusFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;

    const searchable = [
      test.jobTitle,
      test.level,
      test.status,
      test.candidate.name,
      test.candidate.email,
      test.candidate.phone,
      test.recruiter.name,
      test.recruiter.email,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedSearch);
  });

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host");
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const requestOrigin = host ? `${protocol}://${host}` : undefined;
  const appDomain = buildAppDomain(requestOrigin);

  const invitedCount = tests.filter((test) => test.status === "INVITED").length;
  const activeCount = tests.filter((test) => test.status === "IN_PROGRESS").length;
  const completedCount = tests.filter((test) => test.status === "COMPLETED").length;
  const integrityCount = tests.filter((test) => test.fraudEvents.length > 0).length;

  const displayName = currentUser.name || currentUser.email || session.user.name || "User";
  const statusOptions = ["ALL", ...Object.keys(STATUS_LABEL)];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <nav className="nav-absi px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-blue-300 font-medium transition-colors">Candidates</Link>
          <span className="text-sm text-blue-300 font-medium">Activity</span>
          <span className="text-sm text-slate-400">
            {displayName}
            <span className="ml-1.5 badge bg-blue-500/15 text-blue-300 border border-blue-500/20 text-xs">{currentUser.role}</span>
          </span>
          <SignOutButton />
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Recruiter Activity</h2>
            <p className="mt-1 text-sm text-slate-500">All interviews in one place: who sent which test, to whom, and what happened next.</p>
          </div>
          <Link href="/tests/new" className="btn-primary">Schedule Test</Link>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-4">
          <div className="glass-card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Invited</div>
            <div className="mt-1 text-2xl font-bold text-indigo-300">{invitedCount}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">In Progress</div>
            <div className="mt-1 text-2xl font-bold text-orange-300">{activeCount}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Completed</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">{completedCount}</div>
          </div>
          <div className="glass-card p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Integrity Flags</div>
            <div className="mt-1 text-2xl font-bold text-red-300">{integrityCount}</div>
          </div>
        </div>

        <form action="/activity" className="mb-5 grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <input
            type="search"
            name="q"
            defaultValue={searchQuery}
            placeholder="Search recruiter, candidate, email, status, or role"
            className="input-dark"
          />
          <select name="status" defaultValue={statusFilter} className="input-dark">
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status === "ALL" ? "All statuses" : STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary px-5">Filter</button>
            {(searchQuery || statusFilter !== "ALL") && (
              <Link href="/activity" className="btn-secondary px-5">Clear</Link>
            )}
          </div>
        </form>

        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm table-dark">
            <thead>
              <tr>
                <th>Sent By</th>
                <th>Candidate</th>
                <th>Test</th>
                <th>Status</th>
                <th>Timeline</th>
                <th>Score</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {visibleTests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">No activity found.</td>
                </tr>
              ) : (
                visibleTests.map((test) => {
                  const canManage = currentUser.role === "ADMIN" || test.recruiter.id === currentUser.id;
                  const inviteUrl = `${appDomain}/interview/${test.inviteToken}`;
                  const resultUrl = `${appDomain}/results/share/${test.shareToken}`;
                  const attentionCount = test.fraudEvents.length;

                  return (
                    <tr key={test.id}>
                      <td>
                        <div className="font-medium text-white">{test.recruiter.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{test.recruiter.email}</div>
                      </td>
                      <td>
                        <div className="font-medium text-white">{test.candidate.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{test.candidate.email}</div>
                        <div className="mt-0.5 text-xs text-slate-600">{test.candidate.phone}</div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-200">{test.jobTitle || "Training"}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="badge bg-slate-700/50 text-slate-300 border border-white/5">{test.level}</span>
                          <span className="badge bg-slate-800/60 text-slate-400 border border-white/5">{test.questions.length} questions</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`badge ${STATUS_COLOR[test.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                            {STATUS_LABEL[test.status] ?? test.status}
                          </span>
                          {attentionCount > 0 && (
                            <span className="badge bg-red-500/10 text-red-300 border border-red-500/20">
                              Screen/tab: {attentionCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-xs text-slate-500">
                        <div>Created: {formatDate(test.createdAt)}</div>
                        <div>Started: {formatDate(test.startedAt)}</div>
                        <div>Done: {formatDate(test.completedAt)}</div>
                      </td>
                      <td>
                        <div className="font-semibold text-white">{formatScore(test.overallScore)}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{test.overallRating ?? "-"}</div>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1.5">
                          {canManage && (
                            <Link href={`/tests/${test.id}`} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                              Details
                            </Link>
                          )}
                          {canManage && ["QUESTIONS_PENDING", "INVITED"].includes(test.status) && (
                            <Link href={`/tests/${test.id}/review-questions`} className="text-amber-300 hover:text-amber-200 font-medium transition-colors">
                              Review/Invite
                            </Link>
                          )}
                          {["INVITED", "IN_PROGRESS"].includes(test.status) && (
                            <CopyLinkButton value={inviteUrl} label="Copy Invite" />
                          )}
                          {test.status === "COMPLETED" && (
                            <CopyLinkButton value={resultUrl} label="Copy Result" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
