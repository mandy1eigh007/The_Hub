import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getSessionDetail, SessionDetail } from "../lib/api";
import { fmtDate, speakerColor, speakerLabel } from "../lib/format";

export default function Session() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getSessionDetail(id)
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!detail) return null;

  const { session, chunks } = detail;

  return (
    <div>
      <Link to="/sessions" className="text-sm text-sky-400 hover:text-sky-300 underline underline-offset-4">
        Back to sessions
      </Link>
      <h1 className="text-2xl font-bold text-white mt-2 mb-1">
        {session.projects?.name || session.projects?.slug || "Unassigned"}
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        {fmtDate(session.started_at)}
        {session.ended_at ? ` to ${fmtDate(session.ended_at)}` : ""}
        {session.agent ? ` — ${session.agent}` : ""}
      </p>

      {chunks.length === 0 ? (
        <p className="text-slate-500">No captured messages in this session.</p>
      ) : (
        <ol className="space-y-4">
          {chunks.map((c) => (
            <li key={c.id} className="bg-slate-900 border border-slate-800 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                <span className={`text-xs font-semibold ${speakerColor(c.speaker)}`}>
                  {speakerLabel(c.speaker)}
                </span>
                <span className="text-xs text-slate-500">{fmtDate(c.ts)}</span>
              </div>
              <p className="text-slate-200 whitespace-pre-wrap break-words">{c.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
