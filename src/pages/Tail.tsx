import { useEffect, useRef, useState } from "react";
import { getTailLines, TailLine } from "../lib/api";

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
  const [lines, setLines]     = useState<TailLine[]>([]);
  const [error, setError]     = useState<string | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const sinceRef              = useRef<string | null>(null);
  const bottomRef             = useRef<HTMLDivElement>(null);
  const initialLoad           = useRef(true);

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
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } else if (sinceRef.current) {
          const fresh = await getTailLines({ since: sinceRef.current });
          if (fresh.length > 0) {
            setLines((prev) => {
              const combined = [...prev, ...fresh];
              return combined.slice(-300);
            });
            const last = fresh[fresh.length - 1];
            setSession(last.session_path);
            sinceRef.current = last.ts;
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Live Tail</h1>
        {session && (
          <span className="text-xs text-slate-500 font-mono truncate max-w-xs">
            {shortPath(session)}
          </span>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3">{error}</p>
      )}

      <div className="flex-1 overflow-y-auto border border-slate-800 bg-slate-900 p-4 font-mono text-xs space-y-2 min-h-0">
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
