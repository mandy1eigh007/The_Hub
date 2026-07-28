import { useState } from "react";
import { searchNotion, getNotionPage, NotionResult } from "../lib/api";
import { fmtDate } from "../lib/format";

export default function NotionPage() {
  const [query, setQuery]       = useState("");
  const [results, setResults]   = useState<NotionResult[]>([]);
  const [detail, setDetail]     = useState<(NotionResult & { blocks: unknown[] }) | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setDetail(null);
    try {
      const res = await searchNotion(query);
      setResults(res.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function openPage(id: string) {
    setError(null);
    try {
      const page = await getNotionPage(id);
      setDetail(page);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load page");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-4">Notion</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          className="flex-1 bg-slate-900 border border-slate-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500"
          placeholder="Search Notion pages..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2 bg-slate-700 text-white text-sm hover:bg-slate-600 disabled:opacity-40"
        >
          {searching ? "..." : "Search"}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      <div className="flex gap-6">
        {/* Results list */}
        <div className="flex-1 min-w-0">
          {results.length === 0 && !searching && (
            <p className="text-slate-500 text-sm">Search your Notion workspace above.</p>
          )}
          <ul className="divide-y divide-slate-800 border border-slate-800">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => openPage(r.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-800 transition-colors ${
                    detail?.id === r.id ? "bg-slate-800" : ""
                  }`}
                >
                  <p className="text-white text-sm font-medium">{r.title}</p>
                  {r.edited && (
                    <p className="text-amber-400 text-xs mt-0.5">{fmtDate(r.edited)}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Page detail */}
        {detail && (
          <div className="w-80 shrink-0 border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-white font-semibold text-sm">{detail.title}</h2>
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-4 ml-2 shrink-0"
              >
                Open
              </a>
            </div>
            {detail.snippet && (
              <p className="text-slate-400 text-xs leading-relaxed">{detail.snippet}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
