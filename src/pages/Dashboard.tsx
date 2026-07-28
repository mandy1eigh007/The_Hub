import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentMessage, getAllAgentMessages, getImpFiles, ImpFile } from "../lib/api";
import { fmtDate } from "../lib/format";

const POLL_MS = 30_000;

const QUICK_LINKS = [
  { to: "/imp", label: "IMP", detail: "Current focus, next steps, and operating notes." },
  { to: "/wire", label: "Wire", detail: "Messages moving between Claude and Codex." },
  { to: "/tasks", label: "Tasks", detail: "The work that still needs a home." },
  { to: "/dumbfiles", label: "Dumb Files", detail: "Visual explainers for the things we built." },
];

const AGENT_COLOR: Record<string, string> = {
  mandy: "text-white",
  claude: "text-sky-300",
  fable: "text-violet-300",
  codex: "text-emerald-300",
  chatgpt: "text-amber-300",
};

function preview(content: string | null | undefined, limit = 700): string {
  if (!content?.trim()) return "No current focus has synced yet.";
  const clean = content
    .replace(/^#.+$/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
}

function messageLabel(message: AgentMessage): string {
  return message.role === "user" ? "Mandy" : message.agent === "chatgpt"
    ? "ChatGPT"
    : message.agent.charAt(0).toUpperCase() + message.agent.slice(1);
}

export default function Dashboard() {
  const [impFiles, setImpFiles] = useState<ImpFile[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [files, agentMessages] = await Promise.all([getImpFiles(), getAllAgentMessages()]);
        if (!cancelled) {
          setImpFiles(files);
          setMessages(agentMessages);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Home could not refresh");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const now = impFiles.find((file) => file.path === "NOW.md");
  const recentMessages = messages.slice(-4).reverse();

  return (
    <div className="max-w-6xl">
      <div className="mb-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">The Hub</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Home</h1>
        <p className="mt-1 text-sm text-slate-400">Start with what matters. The rest can wait.</p>
      </div>

      {error && (
        <p className="mb-5 border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <section className="border border-slate-800 bg-slate-900 p-5 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">Right now</p>
              <h2 className="mt-1 text-xl font-semibold text-white">Current focus</h2>
            </div>
            <Link to="/imp" className="text-xs text-sky-300 underline underline-offset-4 hover:text-sky-200">
              Open IMP
            </Link>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">Loading the current picture...</p>
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{preview(now?.content)}</p>
          )}
          {now?.updated_at && (
            <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-amber-400">synced {fmtDate(now.updated_at)}</p>
          )}
        </section>

        <section className="border border-slate-800 bg-slate-900 lg:col-span-2">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">Agent check-in</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Latest messages</h2>
            </div>
            <Link to="/agents" className="text-xs text-sky-300 underline underline-offset-4 hover:text-sky-200">
              Open chat
            </Link>
          </div>

          <div className="divide-y divide-slate-800">
            {loading ? (
              <p className="px-5 py-6 text-sm text-slate-500">Loading messages...</p>
            ) : recentMessages.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-500">No agent messages yet. Start one from Agent conversations.</p>
            ) : recentMessages.map((message) => {
              const speaker = message.role === "user" ? "mandy" : message.agent;
              return (
                <div key={message.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-xs font-bold ${AGENT_COLOR[speaker] || "text-slate-300"}`}>
                      {messageLabel(message)}
                    </span>
                    <span className="shrink-0 text-xs text-amber-400">{fmtDate(message.created_at)}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.content}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mt-5">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-400">Go to</p>
            <h2 className="mt-1 text-xl font-semibold text-white">The useful doors</h2>
          </div>
          <p className="text-xs text-slate-500">No hunting through tabs required.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-600 hover:bg-slate-800"
            >
              <p className="font-semibold text-white">{item.label}</p>
              <p className="mt-1 text-sm leading-6 text-slate-400">{item.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
