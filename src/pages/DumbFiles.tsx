import { useEffect, useState } from "react";
import { fmtDate } from "../lib/format";
import { apiFetch } from "../lib/api";

interface DumbFileMeta {
  id: string;
  title: string;
  context: string | null;
  created_at: string;
}

interface DumbFileFull extends DumbFileMeta {
  html: string;
}

let mermaidLoader: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import("mermaid").then(({ default: mermaid }) => {
      // Dumb Files are stored as self-contained HTML. Render diagrams here,
      // inside the authenticated bundle, before the result enters the sandboxed
      // iframe. That avoids a third-party script in private app explainers.
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "dark",
        themeVariables: {
          background: "#0d1117",
          primaryColor: "#161b22",
          primaryBorderColor: "#30363d",
          primaryTextColor: "#e6edf3",
          lineColor: "#6e7681",
          secondaryColor: "#161b22",
          tertiaryColor: "#21262d",
        },
      });
      return mermaid;
    }).catch((error) => {
      // A tab kept open during a deploy can still reference Mermaid's old
      // hashed filename. Let a fresh page load try the current filename.
      mermaidLoader = null;
      throw error;
    });
  }
  return mermaidLoader;
}

function isStaleModuleError(error: unknown): boolean {
  return error instanceof TypeError
    && /failed to fetch dynamically imported module|importing a module script failed/i.test(error.message);
}

async function renderMermaidDiagrams(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const diagrams = Array.from(doc.querySelectorAll<HTMLElement>("pre.mermaid"));
  if (diagrams.length === 0) return html;

  const diagramStyles = doc.createElement("style");
  diagramStyles.textContent = `
    .mermaid-render { overflow-x: auto; margin: 1.25rem 0; padding: 1rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px; }
    .mermaid-render svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
    .diagram-fallback { margin: 1.25rem 0; padding: 1rem; color: #8b949e; background: #161b22; border: 1px solid #30363d; border-radius: 8px; }
  `;
  doc.head.append(diagramStyles);

  const mermaid = await loadMermaid();

  for (const diagram of diagrams) {
    const definition = diagram.textContent?.trim();
    if (!definition) continue;

    try {
      const { svg } = await mermaid.render(`dumb-file-${crypto.randomUUID()}`, definition);
      const svgDoc = new DOMParser().parseFromString(svg, "image/svg+xml");
      const svgElement = svgDoc.documentElement;
      if (svgElement.nodeName !== "svg" || svgElement.querySelector("parsererror")) {
        throw new Error("Mermaid returned invalid SVG");
      }
      const rendered = doc.createElement("div");
      rendered.className = "mermaid-render";
      rendered.append(doc.importNode(svgElement, true));
      diagram.replaceWith(rendered);
    } catch {
      const fallback = doc.createElement("div");
      fallback.className = "diagram-fallback";
      fallback.textContent = "Diagram could not render. Read the step cards below.";
      diagram.replaceWith(fallback);
    }
  }

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

export default function DumbFiles() {
  const [files, setFiles]     = useState<DumbFileMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<DumbFileFull | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [reloadRequired, setReloadRequired] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await apiFetch<DumbFileMeta[]>("/api/dumbfile");
      setFiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function openFile(id: string) {
    setError(null);
    setReloadRequired(false);
    try {
      const data = await apiFetch<DumbFileFull>(`/api/dumbfile?id=${id}`);
      setViewing({ ...data, html: await renderMermaidDiagrams(data.html) });
    } catch (e) {
      if (isStaleModuleError(e)) {
        setReloadRequired(true);
        setError("Dumb Files updated while this Hub tab was open. Reload once, then open the file again.");
      } else {
        setError(e instanceof Error ? e.message : "Load failed");
      }
    }
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await apiFetch<DumbFileFull>("/api/dumbfile", {
        method: "POST",
        body: JSON.stringify({ context: "hub-current-state" }),
      });
      setFiles((prev) => [{ id: data.id, title: data.title, context: "hub-current-state", created_at: new Date().toISOString() }, ...prev]);
      setViewing({ ...data, html: await renderMermaidDiagrams(data.html) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  // Viewer modal
  if (viewing) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <h2 className="text-white font-semibold text-sm truncate">{viewing.title}</h2>
          <button
            onClick={() => setViewing(null)}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 border border-slate-700 hover:border-slate-500"
          >
            close
          </button>
        </div>
        <iframe
          className="flex-1 w-full border-0"
          srcDoc={viewing.html}
          sandbox="allow-scripts"
          title={viewing.title}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Dumb Files</h1>
          <p className="text-slate-500 text-sm mt-1">Visual HTML explainers of what was built</p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="px-5 py-2.5 bg-purple-600 text-white font-semibold text-sm hover:bg-purple-500 disabled:opacity-50 transition-colors"
        >
          {generating ? "Generating..." : "Generate Now"}
        </button>
      </div>

      {generating && (
        <div className="mb-4 px-4 py-3 bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm">
          GPT-4o is building your dumb file... this takes ~15 seconds.
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm mb-4 px-4 py-2 bg-red-400/10 border border-red-400/20 flex items-center justify-between gap-3">
          <p>{error}</p>
          {reloadRequired && (
            <button
              onClick={() => window.location.reload()}
              className="shrink-0 border border-red-400/40 px-3 py-1 text-xs hover:bg-red-400/10"
            >
              reload Hub
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : files.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-700">
          <p className="text-slate-500 text-lg mb-2">No dumb files yet</p>
          <p className="text-amber-400 text-sm">Hit Generate Now to create your first visual explainer.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <button
              key={f.id}
              onClick={() => openFile(f.id)}
              className="w-full text-left bg-slate-900 border border-slate-800 hover:border-purple-500/40 p-4 transition-colors group"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white font-semibold group-hover:text-purple-300 transition-colors">
                    {f.title}
                  </p>
                  {f.context && (
                    <p className="text-slate-500 text-xs mt-0.5 font-mono">{f.context}</p>
                  )}
                </div>
                <span className="text-amber-400 text-xs shrink-0">{fmtDate(f.created_at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
