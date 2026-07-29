import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AgentMessage, getAllAgentMessages, getImpFiles, ImpFile } from "../lib/api";
import { fmtDate } from "../lib/format";
import focusImage from "../assets/home-focus.png";

const POLL_MS = 30_000;

const QUICK_LINKS = [
  { to: "/imp", label: "IMP", title: "The memory that stays.", detail: "Current state, next steps, and the details worth keeping.", accent: "amber" },
  { to: "/tasks", label: "Tasks", title: "Make the next move visible.", detail: "The work that needs a home, not another loose note.", accent: "sky" },
  { to: "/dumbfiles", label: "Dumb Files", title: "See how it works.", detail: "Visual explainers built for your brain, on purpose.", accent: "violet" },
] as const;

const ACCENT = {
  amber: "bg-amber-300 text-amber-300 border-amber-200/30",
  sky: "bg-sky-300 text-sky-300 border-sky-200/30",
  violet: "bg-violet-300 text-violet-300 border-violet-200/30",
};

const TILE_TINT = {
  amber: "bg-amber-950/25",
  sky: "bg-sky-950/30",
  violet: "bg-violet-950/30",
};

const AGENT_COLOR: Record<string, string> = {
  mandy: "text-amber-300",
  claude: "text-sky-300",
  fable: "text-violet-300",
  codex: "text-emerald-300",
  chatgpt: "text-amber-300",
};

function preview(content: string | null | undefined, limit = 175): string {
  if (!content?.trim()) return "Open IMP when you need the why, the now, and what comes next.";
  const clean = content
    .replace(/^#.+$/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n/g, " ")
    .trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
}

function messageLabel(message: AgentMessage): string {
  return message.role === "user"
    ? "Mandy"
    : message.agent === "chatgpt"
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
  const recentMessages = messages.slice(-2).reverse();

  return (
    <div className="relative isolate max-w-7xl overflow-hidden rounded-[2rem] bg-[#07111f] px-5 py-7 sm:px-8 md:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -left-44 top-96 h-[34rem] w-[34rem] rounded-full bg-sky-500/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute left-1/3 -top-64 h-[36rem] w-[36rem] rounded-full bg-amber-400/15 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 bottom-0 h-[32rem] w-[32rem] rounded-full bg-violet-500/15 blur-3xl" />

      <div className="relative">
        <header className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300">The Hub / Home</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Your space, in focus.</h1>
          <p className="mt-2 text-sm text-slate-300">A quiet view of the work that is actually moving.</p>
        </header>

        {error && (
          <p className="mb-5 rounded-2xl border border-red-300/25 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</p>
        )}

        <div className="grid gap-5 lg:grid-cols-5">
          <section
            className="relative min-h-[20rem] overflow-hidden rounded-3xl border border-slate-200/30 bg-slate-950/50 lg:col-span-3"
            style={{ backgroundImage: `url(${focusImage})`, backgroundPosition: "center", backgroundSize: "cover" }}
          >
            <div aria-hidden="true" className="absolute inset-0 bg-[#071827]/65 backdrop-blur-[3px]" />
            <div className="relative flex min-h-[20rem] flex-col justify-between p-6 sm:p-7">
              <div>
                <div className="mb-1 h-1 w-14 rounded-full bg-amber-300" />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Current focus</p>
                <h2 className="mt-4 text-2xl font-semibold text-white">The real-time picture.</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-100">{loading ? "Loading the current picture..." : preview(now?.content)}</p>
              </div>

              <div className="flex items-center justify-between gap-4 pt-6">
                <Link to="/imp" className="rounded-full border border-white/25 bg-white/15 px-5 py-2.5 text-xs font-semibold tracking-wide text-white backdrop-blur-md transition hover:bg-white/25">
                  Open IMP
                </Link>
                {now?.updated_at && <p className="text-xs text-slate-200">synced {fmtDate(now.updated_at)}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200/30 bg-teal-950/45 p-6 backdrop-blur-xl lg:col-span-2">
            <div className="mb-1 h-1 w-14 rounded-full bg-teal-300" />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-200">Live thread</p>
            <h2 className="mt-4 text-xl font-semibold text-white">The room is moving.</h2>

            <div className="mt-5 space-y-3">
              {loading ? (
                <p className="text-sm text-slate-300">Loading recent check-ins...</p>
              ) : recentMessages.length === 0 ? (
                <p className="text-sm text-slate-300">No agent messages yet. Start one from Agent conversations.</p>
              ) : recentMessages.map((message, index) => {
                const speaker = message.role === "user" ? "mandy" : message.agent;
                return (
                  <div
                    key={message.id}
                    className={`rounded-2xl border px-4 py-3 backdrop-blur-md ${
                      index === 1 ? "ml-6 border-emerald-200/20 bg-emerald-950/50" : "border-slate-200/20 bg-white/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${AGENT_COLOR[speaker] || "text-slate-200"}`}>
                        {messageLabel(message)}
                      </span>
                      <span className="text-[10px] text-slate-300">{fmtDate(message.created_at)}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-100">{message.content}</p>
                  </div>
                );
              })}
            </div>

            <Link to="/agents" className="mt-6 inline-block text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-200 hover:text-teal-100">
              Open agents
            </Link>
          </section>
        </div>

        <section className="mt-5 grid gap-5 md:grid-cols-3">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`group rounded-3xl border border-slate-200/30 p-6 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-slate-100/45 ${TILE_TINT[item.accent]}`}
            >
              <div className={`h-1 w-14 rounded-full ${ACCENT[item.accent].split(" ")[0]}`} />
              <p className={`mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] ${ACCENT[item.accent].split(" ")[1]}`}>{item.label}</p>
              <h2 className="mt-5 text-xl font-semibold text-white">{item.title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-200">{item.detail}</p>
              <span className={`mt-6 inline-block rounded-full border bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur-md transition group-hover:bg-white/15 ${ACCENT[item.accent].split(" ").slice(1).join(" ")}`}>
                Open
              </span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
