import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSessions, Session } from "../lib/api";
import { fmtDate } from "../lib/format";

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = s.projects?.name || s.projects?.slug || "Unassigned";
    const list = groups.get(key) || [];
    list.push(s);
    groups.set(key, list);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Sessions</h1>
      {sessions.length === 0 && (
        <p className="text-slate-500">No sessions captured yet.</p>
      )}
      <div className="space-y-8">
        {[...groups.entries()].map(([project, list]) => (
          <section key={project}>
            <h2 className="text-lg font-semibold text-white mb-3">
              {project} <span className="text-slate-500 text-sm font-normal">({list.length})</span>
            </h2>
            <ul className="divide-y divide-slate-800 border border-slate-800 bg-slate-900">
              {list.map((s) => (
                <li key={s.id}>
                  <Link to={`/sessions/${s.id}`} className="block px-4 py-3 hover:bg-slate-800">
                    <span className="text-white">{fmtDate(s.started_at)}</span>
                    {s.ended_at && (
                      <span className="text-slate-500 text-sm ml-3">to {fmtDate(s.ended_at)}</span>
                    )}
                    {s.agent && <span className="text-slate-400 text-sm ml-3">{s.agent}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
