"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

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
    COMPLETED: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20",
    IN_PROGRESS: "bg-orange-500/15 text-orange-300 border border-orange-500/20",
    INVITED: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20",
    QUESTIONS_PENDING: "bg-amber-500/15 text-amber-300 border border-amber-500/20",
    EXPIRED: "bg-slate-500/15 text-slate-400 border border-slate-500/20",
  };

  const STAT_ICONS = ["👥", "✅", "📝", "🛡️"];
  const STAT_COLORS = [
    "from-blue-500/20 to-blue-600/5 border-blue-500/15",
    "from-emerald-500/20 to-emerald-600/5 border-emerald-500/15",
    "from-violet-500/20 to-violet-600/5 border-violet-500/15",
    "from-amber-500/20 to-amber-600/5 border-amber-500/15",
  ];

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0f172a 0%, #1a2332 100%)" }}>
      <nav className="nav-absi px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-sm font-black text-white">A</span>
          </div>
          <h1 className="text-base font-bold text-white">ABSI <span className="text-slate-400 font-normal text-sm">Admin Panel</span></h1>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1">
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
                  ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
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
              <h2 className="text-lg font-semibold text-white">Recruiters</h2>
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
                <h3 className="font-medium text-white mb-4">New Recruiter</h3>
                <form onSubmit={createUser} className="grid grid-cols-3 gap-4">
                  <input placeholder="Name" required value={newUser.name} onChange={(e) => setNewUser((n) => ({ ...n, name: e.target.value }))} className="input-dark" />
                  <input placeholder="Email" type="email" required value={newUser.email} onChange={(e) => setNewUser((n) => ({ ...n, email: e.target.value }))} className="input-dark" />
                  <input placeholder="Password" type="password" required value={newUser.password} onChange={(e) => setNewUser((n) => ({ ...n, password: e.target.value }))} className="input-dark" />
                  {createError && <p className="col-span-3 text-red-400 text-sm">{createError}</p>}
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
                      <td className="font-medium text-white">{u.name}</td>
                      <td className="text-slate-400">{u.email}</td>
                      <td className="text-slate-400">{u.testCount}</td>
                      <td>
                        <span className={`badge ${u.isActive ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20" : "bg-slate-500/15 text-slate-400 border border-slate-500/20"}`}>
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => toggleUser(u.id, !u.isActive)}
                          className={`text-sm font-medium transition-colors ${u.isActive ? "text-amber-400 hover:text-amber-300" : "text-emerald-400 hover:text-emerald-300"}`}
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
            <h2 className="text-lg font-semibold text-white mb-4">All Tests</h2>
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
                        <Link href={`/tests/${t.id}`} className="font-medium text-blue-400 hover:text-blue-300 transition-colors">{t.candidate?.name}</Link>
                      </td>
                      <td className="text-slate-400">{t.jobTitle}</td>
                      <td><span className="text-xs text-slate-500 uppercase tracking-wider">{t.level}</span></td>
                      <td>
                        <span className={`badge ${STATUS_COLOR[t.status] ?? "bg-slate-500/15 text-slate-400"}`}>
                          {t.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="text-slate-300 font-medium">{t.overallScore != null ? `${scoreOutOfFive(t.overallScore).toFixed(1)}/5` : "—"}</td>
                      <td className="text-slate-400">{t.recruiter?.name}</td>
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
            <h2 className="text-lg font-semibold text-white mb-4">Analytics</h2>
            <div className="grid grid-cols-4 gap-4 mb-8 stagger">
              {[
                { label: "Total Candidates", value: analytics.totalCandidates },
                { label: "Tests Completed", value: analytics.totalCompleted },
                { label: "Tests This Month", value: analytics.testsThisMonth },
                { label: "Fraud Events (Month)", value: analytics.fraudThisMonth },
              ].map((card, i) => (
                <div key={card.label} className={`glass-card p-5 animate-fade-in-up bg-gradient-to-br ${STAT_COLORS[i]}`}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl">{STAT_ICONS[i]}</span>
                  </div>
                  <div className="text-3xl font-bold text-white">{card.value}</div>
                  <div className="text-sm text-slate-400 mt-1">{card.label}</div>
                </div>
              ))}
            </div>
            <div className="glass-card p-6">
              <h3 className="font-semibold text-white mb-4">Average Score by Level</h3>
              <div className="space-y-4">
                {analytics.avgByLevel.map((item) => (
                  <div key={item.level} className="flex items-center gap-4">
                    <div className="w-28 text-sm text-slate-400 font-medium">{item.level}</div>
                    <div className="flex-1 bg-slate-800/60 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${(scoreOutOfFive(item.avg) / 5) * 100}%`,
                          background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                          boxShadow: "0 0 12px rgba(59,130,246,0.3)",
                        }}
                      />
                    </div>
                    <div className="text-sm font-medium text-white w-16 text-right">
                      {item.avg > 0 ? `${scoreOutOfFive(item.avg).toFixed(1)}/5` : "—"} <span className="text-slate-500 text-xs">({item.count})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

