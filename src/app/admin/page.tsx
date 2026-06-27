"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";

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
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "" });
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (tab === "users") fetch("/api/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
    if (tab === "tests") fetch("/api/tests").then((r) => r.json()).then((d) => setTests(d.tests ?? []));
    if (tab === "analytics") fetch("/api/admin/analytics").then((r) => r.json()).then(setAnalytics);
  }, [tab]);

  async function toggleUser(userId: string, isActive: boolean) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setUsers((u) => u.map((x) => x.id === userId ? { ...x, isActive } : x));
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
    setNewUser({ name: "", email: "", password: "" });
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
              <h2 className="text-lg font-semibold text-[#0f172a]">Recruiters</h2>
              <button
                onClick={() => setShowCreateUser(true)}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Create Recruiter
              </button>
            </div>
            {showCreateUser && (
              <div className="glass-card p-6 mb-4 animate-fade-in-up">
                <h3 className="font-semibold text-[#0f172a] mb-4">New Recruiter</h3>
                <form onSubmit={createUser} className="grid grid-cols-3 gap-4">
                  <input placeholder="Name" required value={newUser.name} onChange={(e) => setNewUser((n) => ({ ...n, name: e.target.value }))} className="input-dark" />
                  <input placeholder="Email" type="email" required value={newUser.email} onChange={(e) => setNewUser((n) => ({ ...n, email: e.target.value }))} className="input-dark" />
                  <input placeholder="Password" type="password" required value={newUser.password} onChange={(e) => setNewUser((n) => ({ ...n, password: e.target.value }))} className="input-dark" />
                  {createError && <p className="col-span-3 text-red-600 text-sm">{createError}</p>}
                  <div className="col-span-3 flex gap-2">
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
                    <th>Tests</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium text-[#0f172a]">{u.name}</td>
                      <td className="font-mono text-[12.5px] text-[#64748b]">{u.email}</td>
                      <td className="font-mono font-semibold text-[#334155]">{u.testCount}</td>
                      <td>
                        <span className={`badge ${u.isActive ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#f1f5f9] text-[#64748b]"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => toggleUser(u.id, !u.isActive)}
                          className={`text-sm font-medium transition-colors ${u.isActive ? "text-[#dc2626] hover:text-[#b91c1c]" : "text-[#15803d] hover:text-[#166534]"}`}
                        >
                          {u.isActive ? "Deactivate" : "Reactivate"}
                        </button>
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
                  {tests.map((t) => (
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
                          background: five > 0 && five < 3.5 ? "#d97706" : "#2563eb",
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

