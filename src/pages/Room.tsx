import { useEffect, useRef, useState } from "react";
import { getRoomMessages, postRoomMessage, summarizeMessages, RoomMessage } from "../lib/api";
import { fmtDate } from "../lib/format";

const POLL_MS = 4000;

const speakerColor: Record<string, string> = {
  mandy:   "text-yellow-400",
  claude:  "text-sky-400",
  codex:   "text-emerald-400",
  fable:   "text-purple-400",
  chatgpt: "text-orange-400",
  system:  "text-slate-500",
};

function speakerLabel(s: string | null): string {
  if (!s) return "?";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Room() {
  const [messages, setMessages]       = useState<RoomMessage[]>([]);
  const [input, setInput]             = useState("");
  const [posting, setPosting]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [newCount, setNewCount]       = useState(0);
  const [summary, setSummary]         = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const bottomRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolledUp   = useRef(false);
  const sinceRef     = useRef<string | null>(null);
  const initialLoad  = useRef(true);

  // Detect manual scroll-up so polls don't hijack the position
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
          const msgs = await getRoomMessages({ tail: true });
          setMessages(msgs);
          if (msgs.length > 0) {
            sinceRef.current = msgs[msgs.length - 1].created_at;
          }
          initialLoad.current = false;
          setTimeout(scrollToBottom, 100);
        } else if (sinceRef.current) {
          const fresh = await getRoomMessages({ since: sinceRef.current });
          if (fresh.length > 0) {
            setMessages((prev) => [...prev, ...fresh]);
            sinceRef.current = fresh[fresh.length - 1].created_at;
            setNewCount((n) => n + fresh.length);
            setTimeout(scrollToBottom, 100);
          }
        } else {
          const msgs = await getRoomMessages({ tail: true });
          if (msgs.length > 0) {
            setMessages(msgs);
            sinceRef.current = msgs[msgs.length - 1].created_at;
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || posting) return;
    setPosting(true);
    setError(null);
    try {
      const msg = await postRoomMessage(input.trim(), "mandy");
      setMessages((prev) => [...prev, msg]);
      sinceRef.current = msg.ts || msg.created_at;
      setInput("");
      // Always scroll after user's own send
      scrolledUp.current = false;
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Post failed");
    } finally {
      setPosting(false);
    }
  }

  async function handleSummarize() {
    setSummarizing(true);
    setSummary(null);
    try {
      const res = await summarizeMessages("room");
      setSummary(res.summary);
    } catch {
      setSummary("Summary unavailable — try again.");
    } finally {
      setSummarizing(false);
    }
  }

  const groupedByTurn: { turn: number | null; items: RoomMessage[] }[] = [];
  for (const m of messages) {
    const last = groupedByTurn[groupedByTurn.length - 1];
    if (last && last.turn === m.turn_id) {
      last.items.push(m);
    } else {
      groupedByTurn.push({ turn: m.turn_id, items: [m] });
    }
  }

  const PROMPT_CHIPS = [
    "What are we building?",
    "What's unfinished?",
    "Run a checkpoint",
    "Explain the last decision",
    "What should I do first?",
    "What broke?",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-bold text-white">Room</h1>
        <div className="flex items-center gap-3">
          {newCount > 0 && (
            <span className="text-xs text-sky-400 bg-sky-400/10 px-2 py-1">
              {newCount} new
            </span>
          )}
          <button
            onClick={handleSummarize}
            disabled={summarizing || messages.length === 0}
            className="text-xs px-2 py-1 border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {summarizing ? "..." : "Summarize"}
          </button>
        </div>
      </div>

      {/* Prompt chips */}
      <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-slate-800">
        {PROMPT_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => setInput(chip)}
            className="text-xs px-2.5 py-1 bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700 hover:text-white transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3 px-3 py-2 bg-red-400/10 border border-red-400/20">
          {error}
        </p>
      )}

      {summary && (
        <div className="mb-3 px-3 py-2 bg-slate-800 border border-slate-700 text-sm text-slate-200">
          <span className="text-xs font-mono font-bold text-slate-500 block mb-1">TLDR</span>
          {summary}
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto border border-slate-800 bg-slate-900 p-4 space-y-4 min-h-0"
      >
        {messages.length === 0 && (
          <p className="text-slate-500 text-sm">
            No messages yet. Run bridge.py to import ROOM.jsonl, or post below.
          </p>
        )}

        {groupedByTurn.map((group, gi) => (
          <div key={gi} className="space-y-3">
            {group.turn != null && (
              <p className="text-xs text-slate-600 select-none">— turn {group.turn} —</p>
            )}
            {group.items.map((m) => {
              const sp    = (m.speaker || "system").toLowerCase();
              const color = speakerColor[sp] || "text-slate-300";
              return (
                <div key={m.id} className="flex gap-3">
                  <span className={`text-xs font-mono font-bold shrink-0 w-14 pt-0.5 ${color}`}>
                    {speakerLabel(sp)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm whitespace-pre-wrap break-words ${sp === "system" ? "text-slate-500 italic" : "text-slate-100"}`}>
                      {m.content}
                    </p>
                    {m.ts && (
                      <p className="text-xs text-slate-600 mt-0.5">{fmtDate(m.ts)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="mt-3 flex gap-2">
        <input
          className="flex-1 bg-slate-900 border border-slate-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500"
          placeholder="Post to Room..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={posting}
        />
        <button
          type="submit"
          disabled={posting || !input.trim()}
          className="px-4 py-2 bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {posting ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
