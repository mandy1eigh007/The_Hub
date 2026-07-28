import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessions, getOpenLoops, getDecisions, Session, OpenLoop, Decision } from "../lib/api";
import { fmtDate } from "../lib/format";

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getSessions(), getOpenLoops(), getDecisions()])
      .then(([s, l, d]) => {
        setSessions(s);
        setLoops(l);
        setDecisions(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const openCount = loops.filter((l) => !l.resolved).length;
  const lastDecision = decisions[0];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 p-5">
          <p className="text-sm text-slate-400 mb-1">Open loops</p>
          <p className="text-3xl font-bold text-white">{openCount}</p>
          <Link to="/loops" className="text-sm text-sky-400 hover:text-sky-300 underline underline-offset-4">
            View loops
          </Link>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5">
          <p className="text-sm text-slate-400 mb-1">Last decision</p>
          {lastDecision ? (
            <>
              <p className="text-white line-clamp-3">{lastDecision.content}</p>
              <p className="text-xs text-amber-400 mt-2">{fmtDate(lastDecision.ts || lastDecision.created_at)}</p>
            </>
          ) : (
            <p className="text-slate-500">No decisions recorded yet.</p>
          )}
        </div>
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Recent sessions</h2>
      {sessions.length === 0 ? (
        <p className="text-slate-500">
          No sessions captured yet. The capture hook writes here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 border border-slate-800 bg-slate-900">
          {sessions.slice(0, 10).map((s) => (
            <li key={s.id}>
              <Link
                to={`/sessions/${s.id}`}
                className="block px-4 py-3 hover:bg-slate-800"
              >
                <span className="text-white">{s.projects?.name || s.projects?.slug || "Unassigned"}</span>
                <span className="text-amber-400 text-sm ml-3">{fmtDate(s.started_at)}</span>
                {s.agent && <span className="text-slate-400 text-sm ml-3">{s.agent}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
