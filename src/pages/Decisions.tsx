import { useEffect, useState } from "react";
import { getDecisions, Decision } from "../lib/api";
import { fmtDate } from "../lib/format";

function statusLabel(accepted: boolean | null): { text: string; cls: string } {
  if (accepted === true) return { text: "ACCEPTED", cls: "text-emerald-300" };
  if (accepted === false) return { text: "REJECTED", cls: "text-red-400" };
  return { text: "RECORDED", cls: "text-slate-400" };
}

export default function Decisions() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDecisions()
      .then(setDecisions)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Decisions</h1>
      {decisions.length === 0 ? (
        <p className="text-slate-500">
          No decisions recorded yet. This log fills in as decisions are extracted or added.
        </p>
      ) : (
        <ul className="space-y-3">
          {decisions.map((d) => {
            const s = statusLabel(d.accepted);
            return (
              <li key={d.id} className="bg-slate-900 border border-slate-800 p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                  <span className={`text-xs font-semibold ${s.cls}`}>{s.text}</span>
                  <span className="text-xs text-amber-400">{fmtDate(d.ts || d.created_at)}</span>
                  {d.projects && (
                    <span className="text-xs text-slate-400">
                      {d.projects.name || d.projects.slug}
                    </span>
                  )}
                </div>
                <p className="text-slate-200 whitespace-pre-wrap break-words">{d.content}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
