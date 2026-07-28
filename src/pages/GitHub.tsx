import { useEffect, useRef, useState } from "react";
import {
  getGitHubPRs,
  getGitHubRepos,
  getGitHubCommits,
  GitHubPR,
  GitHubRepo,
  GitHubCommit,
} from "../lib/api";
import { fmtDate } from "../lib/format";

type View = "prs" | "repos" | "commits";

export default function GitHub() {
  const [view, setView]         = useState<View>("prs");
  const [prs, setPrs]           = useState<GitHubPR[]>([]);
  const [repos, setRepos]       = useState<GitHubRepo[]>([]);
  const [commits, setCommits]   = useState<GitHubCommit[]>([]);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const loadIdRef               = useRef(0);

  useEffect(() => {
    load("prs");
  }, []);

  async function load(v: View, repo?: string) {
    const id = ++loadIdRef.current;
    setLoading(true);
    setError(null);
    try {
      if (v === "prs") {
        const data = await getGitHubPRs();
        if (id !== loadIdRef.current) return;
        setPrs(data);
      } else if (v === "repos") {
        const data = await getGitHubRepos();
        if (id !== loadIdRef.current) return;
        setRepos(data);
      } else if (v === "commits" && repo) {
        setActiveRepo(repo);
        setCommits([]);
        const data = await getGitHubCommits(repo);
        if (id !== loadIdRef.current) return;
        setCommits(data);
      }
    } catch (e) {
      if (id !== loadIdRef.current) return;
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      if (id === loadIdRef.current) setLoading(false);
    }
  }

  function switchView(v: View) {
    setView(v);
    setError(null);
    if (v !== "commits") {
      load(v);
    } else if (activeRepo) {
      load("commits", activeRepo); // re-fetch if a repo was already selected
    } else {
      loadIdRef.current++; // no repo selected; invalidate in-flight, clear loading
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">GitHub</h1>
        {loading && <span className="text-slate-500 text-sm">Loading...</span>}
      </div>

      <div className="flex border-b border-slate-800 mb-4">
        {(["prs", "repos", "commits"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`px-4 py-2 text-sm border-b-2 capitalize transition-colors ${
              view === v
                ? "border-sky-400 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}
          >
            {v === "prs" ? "Open PRs" : v === "repos" ? "Repos" : "Commits"}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      {view === "prs" && (
        <ul className="divide-y divide-slate-800 border border-slate-800">
          {prs.length === 0 && !loading && !error && (
            <li className="px-4 py-3 text-slate-500 text-sm">No open PRs.</li>
          )}
          {prs.map((pr) => (
            <li key={pr.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white text-sm hover:text-sky-400 font-medium"
                  >
                    {pr.title}
                  </a>
                  <p className="text-amber-400 text-xs mt-0.5">{pr.repo} &middot; {fmtDate(pr.updated_at)}</p>
                  {pr.labels.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {pr.labels.map((l) => (
                        <span key={l} className="text-xs text-slate-400 bg-slate-800 px-1.5 py-0.5">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-amber-400 shrink-0">#{pr.id}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {view === "repos" && (
        <ul className="divide-y divide-slate-800 border border-slate-800">
          {repos.length === 0 && !loading && !error && (
            <li className="px-4 py-3 text-slate-500 text-sm">No repos.</li>
          )}
          {repos.map((r) => (
            <li key={r.full_name} className="px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <a
                  href={r.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white text-sm hover:text-sky-400 font-medium"
                >
                  {r.full_name}
                </a>
                {r.description && (
                  <p className="text-amber-400 text-xs mt-0.5 truncate">{r.description}</p>
                )}
                <p className="text-amber-400 text-xs mt-0.5">pushed {fmtDate(r.pushed_at)}</p>
              </div>
              <button
                onClick={() => { setView("commits"); load("commits", r.full_name); }}
                className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-4 shrink-0"
              >
                Commits
              </button>
            </li>
          ))}
        </ul>
      )}

      {view === "commits" && (
        <div>
          {activeRepo && (
            <p className="text-slate-400 text-sm mb-3 font-mono">{activeRepo}</p>
          )}
          {!activeRepo && !error && (
            <p className="text-slate-500 text-sm">Select a repo from Repos to view commits.</p>
          )}
          <ul className="divide-y divide-slate-800 border border-slate-800">
            {commits.map((c) => (
              <li key={c.sha} className="px-4 py-3 flex items-start gap-3">
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-400 text-xs font-mono hover:text-sky-400 shrink-0 pt-0.5"
                >
                  {c.sha}
                </a>
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{c.message}</p>
                  <p className="text-amber-400 text-xs mt-0.5">{c.author} &middot; {fmtDate(c.date)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
