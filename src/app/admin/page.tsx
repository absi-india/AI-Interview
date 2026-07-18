"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { showToast } from "@/components/ui/Toaster";

type User = { id: string; name: string; email: string; role: string; isActive: boolean; testCount: number };
type Test = { id: string; jobTitle: string; level: string; status: string; createdAt: string; candidate: { name: string }; recruiter: { name: string }; overallScore: number | null };
type Analytics = {
  totalCandidates: number;
  totalCompleted: number;
  testsThisMonth: number;
  fraudThisMonth: number;
  avgByLevel: { level: string; avg: number; count: number }[];
};

function scoreOutOfFive(score: number) {
  return Math.round((score / 2) * 10) / 10;
}

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "tests" | "analytics">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "RECRUITER" });
  const [createError, setCreateError] = useState("");

  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    setFetching(true);
    const done = () => setFetching(false);
    if (tab === "users") fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? [])).finally(done);
    if (tab === "tests") fetch("/api/tests").then((r) => r.json()).then((d) => setTests(d.tests ?? [])).finally(done);
    if (tab === "analytics") fetch("/api/admin/analytics").then((r) => r.json()).then(setAnalytics).finally(done);
  }, [tab]);

  async function toggleUser(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setUsers((u) => u.map((x) => x.id === userId ? { ...x, isActive } : x));
    showToast(isActive ? "User reactivated" : "User deactivated");
  }

  async function changeRole(userId: string, role: string) {
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(typeof data.error === "string" ? data.error : "Failed to change role", "error");
      return;
    }
    setUsers((u) => u.map((x) => x.id === userId ? { ...x, role } : x));
    showToast(role === "ADMIN" ? "User promoted to Admin" : "User changed to Recruiter");
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const data = await res.json();
    if (!res.ok) { setCreateError(data.error); return; }
    setUsers((u) => [{ ...data.user, testCount: 0 }, ...u]);
    setShowCreateUser(false);
    setNewUser({ name: "", email: "", password: "", role: "RECRUITER" });
    showToast(`${data.user.role === "ADMIN" ? "Admin" : "Recruiter"} account created`);
  }

  const STATUS_COLOR: Record<string, string> = {
    COMPLETED: "bg-[#dcfce7] text-[#15803d]",
    IN_PROGRESS: "bg-[#dbeafe] text-[#2563eb]",
    INVITED: "bg-[#e0e7ff] text-[#4f46e5]",
    QUESTIONS_PENDING: "bg-[#fef3c7] text-[#b45309]",
    EXPIRED: "bg-[#f1f5f9] text-[#64748b]",
  };

  const STAT_ICONS = ["👥", "✅", "📝", "🛡️"];
  const STAT_GRADIENTS = [
    "linear-gradient(135deg,#2563eb,#4f46e5)",
    "linear-gradient(135deg,#16a34a,#15803d)",
    "linear-gradient(135deg,#0ea5e9,#0369a1)",
    "linear-gradient(135deg,#dc2626,#b91c1c)",
  ];

  return (
    <div className="min-h-screen" style={{ background: "#f4f6f9" }}>
      <nav className="nav-absi px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" />
          <h1 className="text-base font-semibold text-[#0f172a]">Admin Panel</h1>
        </div>
        <Link href="/dashboard" className="text-sm text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Dashboard
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tab pills */}
        <div className="flex gap-1 mb-8 glass-card-sm p-1.5 w-fit animate-fade-in">
          {(["users", "tests", "analytics"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
                tab === t
                  ? "bg-[#2563eb] text-white shadow-sm"
                  : "text-[#475569] hover:text-[#0f172a] hover:bg-[#f1f5f9]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Users Tab */}
        {tab === "users" && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">Users</h2>
              <button
                onClick={() => setShowCreateUser(true)}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Create User
              </button>
            </div>
            {showCreateUser && (
              <div className="glass-card p-6 mb-4 animate-fade-in-up">
                <h3 className="font-semibold text-[#0f172a] mb-4">New User</h3>
                <form onSubmit={createUser} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <input placeholder="Name" required value={newUser.name} onChange={(e) => setNewUser((n) => ({ ...n, name: e.target.value }))} className="input-dark" />
                  <input placeholder="Email" type="email" required value={newUser.email} onChange={(e) => setNewUser((n) => ({ ...n, email: e.target.value }))} className="input-dark" />
                  <input placeholder="Password" type="password" required value={newUser.password} onChange={(e) => setNewUser((n) => ({ ...n, password: e.target.value }))} className="input-dark" />
                  <select value={newUser.role} onChange={(e) => setNewUser((n) => ({ ...n, role: e.target.value }))} className="input-dark">
                    <option value="RECRUITER">Recruiter</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                  {createError && <p className="col-span-2 sm:col-span-4 text-red-600 text-sm">{createError}</p>}
                  <div className="col-span-2 sm:col-span-4 flex gap-2">
                    <button type="submit" className="btn-primary">Create</button>
                    <button type="button" onClick={() => setShowCreateUser(false)} className="btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            )}
            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm table-dark">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Tests</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fetching ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={`skel-${i}`}>
                        <td><div className="skel h-4 w-28" /></td>
                        <td><div className="skel h-4 w-44" /></td>
                        <td><div className="skel h-5 w-20 rounded-md" /></td>
                        <td><div className="skel h-4 w-8" /></td>
                        <td><div className="skel h-5 w-16 rounded-md" /></td>
                        <td><div className="skel h-4 w-32" /></td>
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-14 text-center">
                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#eff4ff]">
                          <svg className="h-5 w-5 text-[#2563eb]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        </div>
                        <p className="font-medium text-[#0f172a]">No users yet</p>
                        <p className="mt-1 text-sm text-[#64748b]">Create your first recruiter or admin with the button above.</p>
                      </td>
                    </tr>
                  ) : users.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium text-[#0f172a]">{u.name}</td>
                      <td className="font-mono text-[12.5px] text-[#64748b]">{u.email}</td>
                      <td>
                        <span className={`badge ${u.role === "ADMIN" ? "bg-[#e0e7ff] text-[#4f46e5]" : "bg-[#f1f5f9] text-[#475569]"}`}>{u.role}</span>
                      </td>
                      <td className="font-mono font-semibold text-[#334155]">{u.testCount}</td>
                      <td>
                        <span className={`badge ${u.isActive ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-3.5">
                          <button
                            onClick={() => changeRole(u.id, u.role === "ADMIN" ? "RECRUITER" : "ADMIN")}
                            className="text-sm font-medium text-[#4f46e5] hover:text-[#4338ca] transition-colors"
                          >
                            {u.role === "ADMIN" ? "Make Recruiter" : "Make Admin"}
                          </button>
                          <button
                            onClick={() => toggleUser(u.id, !u.isActive)}
                            className={`text-sm font-medium transition-colors ${u.isActive ? "text-[#dc2626] hover:text-[#b91c1c]" : "text-[#15803d] hover:text-[#166534]"}`}
                          >
                            {u.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tests Tab */}
        {tab === "tests" && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">All Tests</h2>
            <div className="glass-card overflow-hidden">
              <table className="w-full text-sm table-dark">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Position</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Recruiter</th>
                  </tr>
                </thead>
                <tbody>
                  {fetching ? (
                    [...Array(5)].map((_, i) => (
                      <tr key={`skel-${i}`}>
                        <td><div className="skel h-4 w-32" /></td>
                        <td><div className="skel h-4 w-40" /></td>
                        <td><div className="skel h-4 w-20" /></td>
                        <td><div className="skel h-5 w-24 rounded-md" /></td>
                        <td><div className="skel h-4 w-12" /></td>
                        <td><div className="skel h-4 w-28" /></td>
                      </tr>
                    ))
                  ) : tests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-14 text-center">
                        <p className="font-medium text-[#0f172a]">No tests yet</p>
                        <p className="mt-1 text-sm text-[#64748b]">Tests appear here once recruiters schedule interviews.</p>
                      </td>
                    </tr>
                  ) : tests.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/tests/${t.id}`} className="font-medium text-[#2563eb] hover:text-[#1d4ed8] transition-colors">{t.candidate?.name}</Link>
                      </td>
                      <td className="text-[#334155]">{t.jobTitle}</td>
                      <td><span className="font-mono text-xs text-[#94a3b8] uppercase tracking-wider">{t.level}</span></td>
                      <td>
                        <span className={`badge ${STATUS_COLOR[t.status] ?? "bg-[#f1f5f9] text-[#64748b]"}`}>
                          {t.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="font-mono text-[#0f172a] font-semibold">{t.overallScore != null ? `${scoreOutOfFive(t.overallScore).toFixed(1)}/5` : "—"}</td>
                      <td className="text-[#64748b]">{t.recruiter?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {tab === "analytics" && !analytics && (
          <div className="animate-fade-in">
            <div className="skel mb-4 h-7 w-32" />
            <div className="mb-8 grid grid-cols-4 gap-4">
              <div className="skel h-[104px] rounded-2xl" />
              <div className="skel h-[104px] rounded-2xl" />
              <div className="skel h-[104px] rounded-2xl" />
              <div className="skel h-[104px] rounded-2xl" />
            </div>
            <div className="skel h-[240px] rounded-2xl" />
          </div>
        )}
        {tab === "analytics" && analytics && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Analytics</h2>
            <div className="grid grid-cols-4 gap-4 mb-8 stagger">
              {[
                { label: "TOTAL CANDIDATES", value: analytics.totalCandidates },
                { label: "TESTS COMPLETED", value: analytics.totalCompleted },
                { label: "TESTS THIS MONTH", value: analytics.testsThisMonth },
                { label: "FRAUD EVENTS (MONTH)", value: analytics.fraudThisMonth },
              ].map((card, i) => (
                <div key={card.label} className="rounded-2xl p-5 animate-fade-in-up text-white" style={{ background: STAT_GRADIENTS[i] }}>
                  <div className="font-mono text-[11px] tracking-wide mb-2.5" style={{ color: "rgba(255,255,255,0.75)" }}>{STAT_ICONS[i]} {card.label}</div>
                  <div className="text-[28px] font-bold tracking-tight">{card.value}</div>
                </div>
              ))}
            </div>
            <div className="glass-card p-6">
              <h3 className="font-semibold text-[#0f172a] mb-5">Average Score by Level</h3>
              <div className="space-y-4">
                {analytics.avgByLevel.map((item) => {
                  const five = scoreOutOfFive(item.avg);
                  return (
                  <div key={item.level} className="flex items-center gap-4">
                    <div className="w-28 text-sm text-[#334155] font-medium">{item.level}</div>
                    <div className="flex-1 bg-[#eef1f5] rounded-full h-[9px] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${(five / 5) * 100}%`,
                          background: five > 0 && five < 3.5 ? "#d97706" : "linear-gradient(90deg,#0d9488,#06b6d4)",
                        }}
                      />
                    </div>
                    <div className="font-mono text-sm font-semibold text-[#0f172a] w-20 text-right">
                      {item.avg > 0 ? `${five.toFixed(1)}/5` : "—"} <span className="text-[#94a3b8] text-xs">({item.count})</span>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

