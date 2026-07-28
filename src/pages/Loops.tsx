import { useEffect, useState } from "react";
import { getOpenLoops, setLoopResolved, OpenLoop } from "../lib/api";
import { fmtDate } from "../lib/format";

export default function Loops() {
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getOpenLoops()
      .then(setLoops)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(loop: OpenLoop) {
    setBusyId(loop.id);
    setError(null);
    try {
      await setLoopResolved(loop.id, !loop.resolved);
      setLoops((prev) =>
        prev.map((l) => (l.id === loop.id ? { ...l, resolved: !loop.resolved } : l))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="text-slate-400">Loading…</p>;

  const open = loops.filter((l) => !l.resolved);
  const resolved = loops.filter((l) => l.resolved);

  const renderList = (list: OpenLoop[]) => (
    <ul className="space-y-3">
      {list.map((l) => (
        <li key={l.id} className="bg-slate-900 border border-slate-800 p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
            <span className={`text-xs font-semibold ${l.resolved ? "text-emerald-300" : "text-amber-300"}`}>
              {l.resolved ? "RESOLVED" : "OPEN"}
            </span>
            <span className="text-xs text-amber-400">{fmtDate(l.ts || l.created_at)}</span>
            {l.projects && (
              <span className="text-xs text-slate-400">{l.projects.name || l.projects.slug}</span>
            )}
          </div>
          <p className="text-slate-200 whitespace-pre-wrap break-words mb-3">{l.content}</p>
          <button
            onClick={() => toggle(l)}
            disabled={busyId === l.id}
            className="text-sm px-3 py-1 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500 disabled:opacity-50"
          >
            {l.resolved ? "Reopen" : "Mark resolved"}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Open Loops</h1>
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {open.length === 0 ? (
        <p className="text-slate-500 mb-6">No open loops. Clear deck.</p>
      ) : (
        <div className="mb-6">{renderList(open)}</div>
      )}

      {resolved.length > 0 && (
        <div>
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="text-sm text-slate-400 hover:text-white underline underline-offset-4 mb-3"
          >
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
          {showResolved && renderList(resolved)}
        </div>
      )}
    </div>
  );
}
