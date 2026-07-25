import { useEffect, useRef, useState } from "react";
import {
  getChatThreads,
  getChatThread,
  sendChatMessage,
  ChatThread,
  ChatMessage,
} from "../lib/api";
import { fmtDate } from "../lib/format";

export default function Chat() {
  const [threads, setThreads]   = useState<ChatThread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const bottomRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getChatThreads()
      .then(setThreads)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function openThread(id: string) {
    setThreadId(id);
    setError(null);
    try {
      const { messages: msgs } = await getChatThread(id);
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    setError(null);
    const userMsg = input.trim();
    setInput("");

    const optimistic: ChatMessage = {
      id:      "optimistic",
      role:    "user",
      content: userMsg,
      model:   null,
      ts:      new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await sendChatMessage({ message: userMsg, thread_id: threadId || undefined });

      // If this was a new thread, update state
      if (!threadId) {
        setThreadId(res.thread_id);
        setThreads((prev) => [
          { id: res.thread_id, title: res.thread_title, session_id: null, created_at: new Date().toISOString() },
          ...prev,
        ]);
      }

      const assistant: ChatMessage = {
        id:      "reply-" + Date.now(),
        role:    "assistant",
        content: res.reply,
        model:   "gpt-4o",
        ts:      new Date().toISOString(),
      };
      setMessages((prev) => [...prev.filter((m) => m.id !== "optimistic"), optimistic, assistant]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== "optimistic"));
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] gap-4">
      {/* Thread sidebar */}
      <div className="w-48 shrink-0 flex flex-col border-r border-slate-800">
        <div className="flex items-center justify-between px-2 py-3 border-b border-slate-800">
          <span className="text-sm font-semibold text-white">ChatGPT</span>
          <button
            onClick={() => { setThreadId(null); setMessages([]); }}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-slate-500 text-xs px-2 py-3">Loading...</p>}
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-slate-800/50 transition-colors ${
                threadId === t.id
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
              }`}
            >
              <p className="truncate">{t.title || "Untitled"}</p>
              <p className="text-slate-600 text-xs mt-0.5">{fmtDate(t.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!threadId && messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-500 text-sm">New conversation — type below to start.</p>
          </div>
        )}

        {messages.length > 0 && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-sky-700/30 text-sky-100 border border-sky-700/50"
                      : "bg-slate-800 text-slate-100 border border-slate-700"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p className="text-xs opacity-50 mt-1">{m.role === "user" ? "You" : "GPT-4o"}</p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {error && (
          <p className="text-red-400 text-xs mt-2 mb-2">{error}</p>
        )}

        <form onSubmit={handleSend} className="mt-3 flex gap-2">
          <input
            className="flex-1 bg-slate-900 border border-slate-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-sky-500 placeholder-slate-500"
            placeholder={threadId ? "Continue..." : "Ask ChatGPT anything..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-4 py-2 bg-orange-600 text-white text-sm font-medium hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? "..." : "Ask"}
          </button>
        </form>
      </div>
    </div>
  );
}
