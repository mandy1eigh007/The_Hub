import { useEffect, useRef, useState } from "react";
import { getWireMessages, WireMessage, apiFetch } from "../lib/api";
import { fmtDate } from "../lib/format";

const POLL_MS = 5000;

const speakerColor: Record<string, string> = {
  claude:  "text-sky-400",
  codex:   "text-emerald-400",
  system:  "text-slate-500",
};

export default function Wire() {
  const [messages, setMessages] = useState<WireMessage[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [acking, setAcking]     = useState<string | null>(null);

  async function ack(m: WireMessage) {
    if (acking) return;
    setAcking(m.id);
    try {
      await apiFetch("/api/wire", {
        method: "POST",
        body: JSON.stringify({
          speaker: "Hub",
          kind: "ack",
          re: m.re || m.kind || m.speaker,
          content: "Received.",
        }),
      });
    } catch {
      // non-fatal
    } finally {
      setAcking(null);
    }
  }
  const sinceRef                = useRef<string | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const initialLoad             = useRef(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        if (initialLoad.current) {
          const msgs = await getWireMessages();
          setMessages(msgs);
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            sinceRef.current = last.created_at;
          }
          initialLoad.current = false;
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } else if (sinceRef.current) {
          const fresh = await getWireMessages({ since: sinceRef.current });
          if (fresh.length > 0) {
            setMessages((prev) => [...prev, ...fresh]);
            const last = fresh[fresh.length - 1];
            sinceRef.current = last.created_at;
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
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold text-white">Wire</h1>
        <span className="text-xs text-slate-500">Claude — Codex traffic</span>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3">{error}</p>
      )}

      <div className="flex-1 overflow-y-auto border border-slate-800 bg-slate-900 p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <p className="text-slate-500 text-sm">
            No wire messages yet. Run bridge.py to import WIRE.jsonl.
          </p>
        )}

        {messages.map((m) => {
          const sp    = (m.speaker || "system").toLowerCase();
          const color = speakerColor[sp] || "text-slate-300";
          const label = sp.charAt(0).toUpperCase() + sp.slice(1);
          return (
            <div key={m.id} className="border-l-2 border-slate-700 pl-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono font-bold ${color}`}>{label}</span>
                {m.kind && (
                  <span className="text-xs text-amber-400 font-mono">{m.kind}</span>
                )}
                {m.re && (
                  <span className="text-xs text-amber-400">re: {m.re}</span>
                )}
                {m.ts && (
                  <span className="text-xs text-amber-400 ml-auto">{fmtDate(m.ts)}</span>
                )}
                <button
                  onClick={() => ack(m)}
                  disabled={acking === m.id}
                  className="text-xs text-slate-400 hover:text-emerald-400 disabled:opacity-40 ml-1 font-mono"
                  title="Acknowledge"
                >
                  {acking === m.id ? "..." : "ack"}
                </button>
              </div>
              <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{m.content}</p>
              {m.artifact && (
                <details className="text-xs text-slate-500 cursor-pointer">
                  <summary>Full artifact</summary>
                  <pre className="mt-1 text-xs overflow-x-auto whitespace-pre-wrap">{m.artifact}</pre>
                </details>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
