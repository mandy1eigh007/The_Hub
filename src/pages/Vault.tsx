import { useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { search, SearchResults } from "../lib/api";
import { fmtDate, speakerColor, speakerLabel } from "../lib/format";

export default function Vault() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResults(await search(q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  const total = results
    ? results.chunks.length + results.decisions.length + results.open_loops.length
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Vault</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-8 max-w-2xl">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search every captured conversation"
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-400"
        />
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold"
        >
          {busy ? "Searching" : "Search"}
        </button>
      </form>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      {results && (
        <div className="space-y-8">
          <p className="text-sm text-slate-400">
            {total} result{total === 1 ? "" : "s"} for "{results.query}"
          </p>

          {results.chunks.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Conversation</h2>
              <ul className="space-y-3">
                {results.chunks.map((c) => (
                  <li key={c.id} className="bg-slate-900 border border-slate-800 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 mb-2">
                      <span className={`text-xs font-semibold ${speakerColor(c.speaker)}`}>
                        {speakerLabel(c.speaker)}
                      </span>
                      <span className="text-xs text-slate-500">{fmtDate(c.ts)}</span>
                      {c.session_id && (
                        <Link
                          to={`/sessions/${c.session_id}`}
                          className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-4"
                        >
                          Open session
                        </Link>
                      )}
                    </div>
                    <p className="text-slate-200 whitespace-pre-wrap break-words line-clamp-6">
                      {c.content}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.decisions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Decisions</h2>
              <ul className="space-y-3">
                {results.decisions.map((d) => (
                  <li key={d.id} className="bg-slate-900 border border-slate-800 p-4">
                    <p className="text-slate-200">{d.content}</p>
                    <p className="text-xs text-slate-500 mt-2">{fmtDate(d.ts || d.created_at)}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {results.open_loops.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Open loops</h2>
              <ul className="space-y-3">
                {results.open_loops.map((l) => (
                  <li key={l.id} className="bg-slate-900 border border-slate-800 p-4">
                    <p className="text-slate-200">{l.content}</p>
                    <p className="text-xs text-slate-500 mt-2">
                      {l.resolved ? "RESOLVED" : "OPEN"} — {fmtDate(l.ts || l.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {total === 0 && <p className="text-slate-500">Nothing matched. Try different words.</p>}
        </div>
      )}
    </div>
  );
}
