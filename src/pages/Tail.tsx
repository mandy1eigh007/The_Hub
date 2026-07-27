import { useEffect, useRef, useState } from "react";
import { getTailLines, summarizeMessages, TailLine } from "../lib/api";

const POLL_MS = 3000;

const speakerColor: Record<string, string> = {
  claude: "text-sky-400",
  mandy:  "text-yellow-400",
  system: "text-slate-500",
};

function shortPath(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export default function Tail() {
  const [lines, setLines]             = useState<TailLine[]>([]);
  const [error, setError]             = useState<string | null>(null);
  const [session, setSession]         = useState<string | null>(null);
  const [summary, setSummary]         = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const sinceRef       = useRef<string | null>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const scrolledUp     = useRef(false);
  const initialLoad    = useRef(true);

  // Detect manual scroll-up so the poll timer doesn't hijack the position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const div = el; // alias so TypeScript carries the narrowed type into the closure
    function onScroll() {
      scrolledUp.current = div.scrollHeight - div.scrollTop - div.clientHeight > 80;
    }
    div.addEventListener("scroll", onScroll, { passive: true });
    return () => div.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToBottom() {
    if (!scrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        if (initialLoad.current) {
          const fresh = await getTailLines({ limit: 80 });
          setLines(fresh);
          if (fresh.length > 0) {
            setSession(fresh[fresh.length - 1].session_path);
            sinceRef.current = fresh[fresh.length - 1].ts;
          }
          initialLoad.current = false;
          setTimeout(scrollToBottom, 100);
        } else if (sinceRef.current) {
          const fresh = await getTailLines({ since: sinceRef.current });
          if (fresh.length > 0) {
            setLines((prev) => {
              const next = [...prev, ...fresh];
              // Only trim the top when at the bottom — prevents scroll-position jump while reading.
              // Safety cap of 1000 prevents unbounded growth if scrolled up for a long time.
              if (!scrolledUp.current) return next.slice(-300);
              if (next.length > 1000) return next.slice(-1000);
              return next;
            });
            const last = fresh[fresh.length - 1];
            setSession(last.session_path);
            sinceRef.current = last.ts;
            setTimeout(scrollToBottom, 100);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Poll failed");
      }
      timer = setTimeout(poll, POLL_MS);
    }

    poll();
    return () => clearTimeout(timer);
  }, []);

  async function handleSummarize() {
    setSummarizing(true);
    setSummary(null);
    try {
      const res = await summarizeMessages("tail");
      setSummary(res.summary);
    } catch {
      setSummary("Summary unavailable — try again.");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Live Tail</h1>
        <div className="flex items-center gap-3">
          {session && (
            <span className="text-xs text-slate-500 font-mono truncate max-w-xs">
              {shortPath(session)}
            </span>
          )}
          <button
            onClick={handleSummarize}
            disabled={summarizing || lines.length === 0}
            className="text-xs px-2 py-1 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {summarizing ? "..." : "Summarize"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3">{error}</p>
      )}

      {summary && (
        <div className="mb-3 px-3 py-2 bg-slate-800 border border-slate-700 text-sm text-slate-200">
          <span className="text-xs font-mono font-bold text-slate-500 block mb-1">TLDR</span>
          {summary}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto border border-slate-800 bg-slate-900 p-4 font-mono text-xs space-y-2 min-h-0"
      >
        {lines.length === 0 && (
          <p className="text-slate-500">
            No live session data yet. bridge.py must be running.
          </p>
        )}

        {lines.map((line) => {
          const sp    = (line.speaker || "system").toLowerCase();
          const color = speakerColor[sp] || "text-slate-300";
          const label = sp === "claude" ? "Claude" : sp === "mandy" ? "Mandy" : sp;
          return (
            <div key={line.id} className="flex gap-2">
              <span className={`shrink-0 w-12 font-bold ${color}`}>{label}</span>
              <span className="text-slate-200 whitespace-pre-wrap break-words flex-1 min-w-0">
                {line.content}
              </span>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <p className="mt-2 text-xs text-slate-600">Refreshes every 3 seconds via bridge.py</p>
    </div>
  );
}
