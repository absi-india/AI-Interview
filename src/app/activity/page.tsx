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
        select: { id: true, severity: true, occurredAt: true },
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
    <div className="min-h-screen" style={{ background: "#f4f6f9" }}>
      <nav className="nav-absi px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <span className="font-semibold text-[15px] text-[#0f172a] hidden sm:inline">Technical Interview Portal</span>
          </div>
          <div className="flex gap-5">
            <Link href="/dashboard" className="text-sm text-[#475569] hover:text-[#2563eb] font-medium transition-colors">Candidates</Link>
            <span className="text-sm text-[#2563eb] font-semibold">Activity</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-sm text-[#0f172a] font-semibold flex items-center gap-2">
            {displayName}
            <span className="badge bg-[#eff4ff] text-[#2563eb] font-mono text-[10.5px] tracking-wide">{currentUser.role}</span>
          </span>
          <SignOutButton />
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-semibold text-[#0f172a] tracking-tight">Recruiter Activity</h2>
            <p className="mt-1 text-sm text-[#64748b]">All interviews in one place: who sent which test, to whom, and what happened next.</p>
          </div>
          <Link href="/tests/new" className="btn-primary">Schedule Test</Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="glass-card p-5">
            <div className="mono-eyebrow text-[11px]">INVITED</div>
            <div className="mt-2.5 text-[28px] font-bold tracking-tight text-[#4f46e5]">{invitedCount}</div>
          </div>
          <div className="glass-card p-5">
            <div className="mono-eyebrow text-[11px]">IN PROGRESS</div>
            <div className="mt-2.5 text-[28px] font-bold tracking-tight text-[#2563eb]">{activeCount}</div>
          </div>
          <div className="glass-card p-5">
            <div className="mono-eyebrow text-[11px]">COMPLETED</div>
            <div className="mt-2.5 text-[28px] font-bold tracking-tight text-[#15803d]">{completedCount}</div>
          </div>
          <div className="glass-card p-5">
            <div className="mono-eyebrow text-[11px]">INTEGRITY FLAGS</div>
            <div className="mt-2.5 text-[28px] font-bold tracking-tight text-[#dc2626]">{integrityCount}</div>
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
            <button type="submit" className="btn-ink px-5">Filter</button>
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
                  <td colSpan={7} className="py-10 text-center text-[#94a3b8]">No activity found.</td>
                </tr>
              ) : (
                visibleTests.map((test) => {
                  const canManage = currentUser.role === "ADMIN" || test.recruiter.id === currentUser.id;
                  const inviteUrl = `${appDomain}/interview/${test.inviteToken}`;
                  const resultUrl = `${appDomain}/results/share/${test.shareToken}`;
                  const attentionCount = test.fraudEvents.filter((event) =>
                    happenedDuringInterview(event, test.completedAt)
                  ).length;
                  const displayStatus = getDisplayStatus(test.status, attentionCount);
                  const attentionDisplay = Math.min(attentionCount, MAX_PROCTORING_VIOLATIONS);

                  return (
                    <tr key={test.id}>
                      <td>
                        <div className="font-medium text-[#0f172a]">{test.recruiter.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#94a3b8]">{test.recruiter.email}</div>
                      </td>
                      <td>
                        <div className="font-medium text-[#0f172a]">{test.candidate.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#94a3b8]">{test.candidate.email}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#94a3b8]">{test.candidate.phone}</div>
                      </td>
                      <td>
                        <div className="font-medium text-[#334155]">{test.jobTitle || "Training"}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="badge bg-[#f1f5f9] text-[#475569]">{test.level}</span>
                          <span className="badge bg-[#f1f5f9] text-[#64748b]">{test.questions.length} questions</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1.5">
                          <span className={`badge ${STATUS_COLOR[displayStatus] ?? "bg-[#f1f5f9] text-[#64748b]"}`}>
                            {STATUS_LABEL[displayStatus] ?? displayStatus}
                          </span>
                          {attentionCount > 0 && (
                            <span className="badge bg-[#fee2e2] text-[#dc2626]">
                              Screen/tab: {attentionDisplay}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="font-mono text-[11px] text-[#94a3b8] leading-relaxed">
                        <div>Created: {formatDate(test.createdAt)}</div>
                        <div>Started: {formatDate(test.startedAt)}</div>
                        <div>Done: {formatDate(test.completedAt)}</div>
                      </td>
                      <td>
                        <div className="font-mono font-semibold text-[#0f172a]">{formatScore(test.overallScore)}</div>
                        <div className="mt-0.5 text-xs text-[#64748b]">{test.overallRating ?? "-"}</div>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1.5">
                          {canManage && (
                            <Link href={`/tests/${test.id}`} className="text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors">
                              Details
                            </Link>
                          )}
                          {canManage && ["QUESTIONS_PENDING", "INVITED"].includes(test.status) && (
                            <Link href={`/tests/${test.id}/review-questions`} className="text-[#b45309] hover:text-[#92400e] font-medium transition-colors">
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
