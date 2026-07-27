import { useEffect, useRef, useState } from "react";
import {
  AgentMessage,
  AgentName,
  clearAgentThread,
  getAllAgentMessages,
  getAgentThread,
  sendAgentMessage,
  sendSecretMessage,
} from "../lib/api";

const SECRET_TOOLS: { value: string; label: string }[] = [
  { value: "github-whoami", label: "GitHub — identify token" },
  { value: "github-repos",  label: "GitHub — list repos" },
];
import { fmtDate } from "../lib/format";

const AGENTS: AgentName[] = ["claude", "fable", "codex", "chatgpt"];

const AGENT_LABEL: Record<AgentName, string> = {
  claude:  "Claude",
  fable:   "Fable",
  codex:   "Codex",
  chatgpt: "ChatGPT",
};

const AGENT_MODEL: Record<AgentName, string> = {
  claude:  "Sonnet 4.6",
  fable:   "Fable 5",
  codex:   "GPT-4.1 mini",
  chatgpt: "GPT-4.1",
};

const AGENT_COLOR: Record<AgentName | "mandy", string> = {
  claude:  "text-sky-400",
  fable:   "text-purple-400",
  codex:   "text-emerald-400",
  chatgpt: "text-orange-400",
  mandy:   "text-yellow-400",
};

const AGENT_BORDER: Record<AgentName, string> = {
  claude:  "border-sky-500/30",
  fable:   "border-purple-500/30",
  codex:   "border-emerald-500/30",
  chatgpt: "border-orange-500/30",
};

export default function Agents() {
  const [active, setActive]       = useState<AgentName | "all">("claude");
  const [threadIds, setThreadIds] = useState<Partial<Record<AgentName, string>>>({});
  const [msgs, setMsgs]           = useState<Partial<Record<AgentName | "all", AgentMessage[]>>>({});
  const [loading, setLoading]     = useState(false);
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [input, setInput]         = useState("");
  const [secret, setSecret]       = useState("");
  const [slotOpen, setSlotOpen]   = useState(false);
  const [tool, setTool]           = useState(SECRET_TOOLS[0].value);
  const bottomRef                 = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  // Clear secret whenever agent changes — prevents cross-agent secret submission
  useEffect(() => {
    setSecret("");
    setSlotOpen(false);
  }, [active]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (active === "all") {
          const data = await getAllAgentMessages();
          if (!cancelled) setMsgs((prev) => ({ ...prev, all: data }));
        } else {
          const { thread, messages } = await getAgentThread(active);
          if (!cancelled) {
            setThreadIds((prev) => ({ ...prev, [active]: thread.id }));
            setMsgs((prev) => ({ ...prev, [active]: messages }));
          }
        }
        if (!cancelled) setTimeout(scrollToBottom, 100);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [active]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || active === "all") return;

    // Capture agent at send time — agent buttons are disabled while sending, but
    // capture here as a belt-and-suspenders guard for input restoration.
    const activeAtSend = active as AgentName;

    setSending(true);
    setError(null);
    setInput("");
    setSecret("");
    setSlotOpen(false);

    const optimistic: AgentMessage = {
      id: `opt-${Date.now()}`,
      thread_id: threadIds[activeAtSend] || "",
      agent: activeAtSend,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMsgs((prev) => ({ ...prev, [activeAtSend]: [...(prev[activeAtSend] || []), optimistic] }));
    setTimeout(scrollToBottom, 50);

    try {
      const secretText = secret.trim();
      const result = secretText
        ? await sendSecretMessage({
            agent: activeAtSend,
            message: text,
            secret: secretText,
            tool,
            thread_id: threadIds[activeAtSend],
          })
        : await sendAgentMessage({
            agent: activeAtSend,
            message: text,
            thread_id: threadIds[activeAtSend],
          });
      setThreadIds((prev) => ({ ...prev, [activeAtSend]: result.thread_id }));
      setMsgs((prev) => ({
        ...prev,
        [activeAtSend]: [
          ...(prev[activeAtSend] || []).filter((m) => m.id !== optimistic.id),
          result.user_message,
          result.reply,
        ],
      }));
      setSecret("");
      setSlotOpen(false);
      setTimeout(scrollToBottom, 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
      // Only restore draft to the agent it was written for
      if (active === activeAtSend) setInput(text);
      setMsgs((prev) => ({
        ...prev,
        [activeAtSend]: (prev[activeAtSend] || []).filter((m) => m.id !== optimistic.id),
      }));
    } finally {
      setSending(false);
    }
  }

  async function handleClear() {
    if (active === "all") return;
    const tid = threadIds[active];
    if (!tid) return;
    try {
      await clearAgentThread(tid);
      setThreadIds((prev) => { const n = { ...prev }; delete n[active]; return n; });
      setMsgs((prev) => ({ ...prev, [active]: [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    }
  }

  const currentMessages = msgs[active] || [];

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)]">

      {/* Agent selector */}
      <div className="w-44 shrink-0 border-r border-slate-800 flex flex-col" style={{ background: "#0f172a" }}>
        <div className="px-3 py-3 border-b border-slate-800">
          <p className="text-xs font-bold tracking-widest text-slate-500 uppercase"
             style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
            Conversations
          </p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1">
          <button
            onClick={() => setActive("all")}
            disabled={sending}
            className={`w-full text-left px-3 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              active === "all"
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <p className="text-sm font-medium">All feed</p>
            <p className="text-xs text-slate-600 font-mono">read only</p>
          </button>

          <div className="mx-2 my-2 border-t border-slate-800" />

          {AGENTS.map((agent) => (
            <button
              key={agent}
              onClick={() => setActive(agent)}
              disabled={sending}
              className={`w-full text-left px-3 py-2.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                active === agent
                  ? `bg-slate-800 border ${AGENT_BORDER[agent]}`
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              <p className={`text-sm font-semibold ${active === agent ? AGENT_COLOR[agent] : ""}`}>
                {AGENT_LABEL[agent]}
              </p>
              <p className="text-xs text-slate-600 font-mono mt-0.5">{AGENT_MODEL[agent]}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex flex-1 flex-col min-w-0">

        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between shrink-0"
             style={{ background: "#0f172a" }}>
          <div>
            <h1
              className={`text-2xl font-bold tracking-wide ${
                active === "all" ? "text-slate-300" : AGENT_COLOR[active]
              }`}
              style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            >
              {active === "all" ? "All feed" : AGENT_LABEL[active]}
            </h1>
            {active !== "all" && (
              <p className="text-xs text-slate-500 font-mono">{AGENT_MODEL[active]}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {active !== "all" && (
              <p className="text-xs text-slate-700 text-right max-w-xs">
                other agents do not receive this thread
              </p>
            )}
            {active !== "all" && threadIds[active] && (
              <button
                onClick={handleClear}
                disabled={sending}
                className="text-xs text-slate-600 hover:text-red-400 px-2 py-1 border border-slate-800 hover:border-red-400/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm px-5 py-2 bg-red-400/10 border-b border-red-400/20 shrink-0">
            {error}
          </p>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {loading && <p className="text-slate-500 text-sm">Loading...</p>}

          {!loading && currentMessages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-slate-600 text-sm">
                {active === "all"
                  ? "No messages yet."
                  : `No conversation with ${AGENT_LABEL[active]} yet.`}
              </p>
            </div>
          )}

          {currentMessages.map((m) => {
            const speaker  = m.role === "user" ? "mandy" : m.agent;
            const color    = AGENT_COLOR[speaker as AgentName | "mandy"] || "text-slate-300";
            const label    = m.role === "user" ? "Mandy" : AGENT_LABEL[m.agent];
            return (
              <div key={m.id} className="flex gap-3">
                <span className={`text-xs font-mono font-bold shrink-0 w-14 pt-0.5 ${color}`}>
                  {label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{m.content}</p>
                  <p className="text-xs text-slate-700 mt-0.5">{fmtDate(m.created_at)}</p>
                </div>
              </div>
            );
          })}

          {sending && active !== "all" && (
            <div className="flex gap-3">
              <span className={`text-xs font-mono font-bold shrink-0 w-14 pt-0.5 ${AGENT_COLOR[active]}`}>
                {AGENT_LABEL[active]}
              </span>
              <p className="text-sm text-slate-500 italic">Thinking...</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          className="border-t border-slate-800 p-4 flex gap-2 shrink-0"
          style={{ background: "#020817" }}
        >
          {active === "all" ? (
            <p className="flex-1 text-slate-600 text-sm py-2.5">
              Select an agent above to start a conversation.
            </p>
          ) : (
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-900 border border-slate-700 text-white px-3 py-2.5 text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500"
                  placeholder={`Message ${AGENT_LABEL[active]}...`}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={sending}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="px-4 py-2 bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>

              {/* Secret slot */}
              <div className="border border-red-500/20 rounded" style={{ background: "#160a0a" }}>
                <button
                  type="button"
                  onClick={() => setSlotOpen((o) => !o)}
                  className="w-full px-3 py-2 flex items-center justify-between text-xs text-red-400/60 hover:text-red-400/90 transition-colors"
                >
                  <span className="font-mono font-bold tracking-wide">
                    SECRET SLOT — not saved, removed from this form after send
                  </span>
                  <span className="text-slate-700 shrink-0 ml-2">{slotOpen ? "[collapse]" : "[expand]"}</span>
                </button>

                {slotOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-red-500/20">
                    <label htmlFor="secret-tool-select" className="sr-only">Secret tool</label>
                    <select
                      id="secret-tool-select"
                      className="w-full bg-slate-900 border border-red-500/20 text-red-300 font-mono text-xs px-2 py-1.5 focus:outline-none mt-2"
                      value={tool}
                      onChange={(e) => setTool(e.target.value)}
                    >
                      {SECRET_TOOLS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <label htmlFor="secret-credential" className="sr-only">Credential</label>
                    <textarea
                      id="secret-credential"
                      className="w-full border border-red-500/30 text-red-300 font-mono text-xs px-3 py-2 focus:outline-none focus:border-red-500/50 placeholder-red-900/60 resize-none"
                      style={{ background: "#020817" }}
                      rows={2}
                      placeholder="Paste key or token here..."
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-700">
                        Used by the Hub server for this action. Not sent to {AGENT_LABEL[active as AgentName]} or stored by the Hub.
                      </p>
                      <p className="text-xs text-red-900 shrink-0 ml-2">Hub server only</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
