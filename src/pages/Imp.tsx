import { useEffect, useState } from "react";
import { getImpFiles, putImpFile, ImpFile } from "../lib/api";
import { fmtDate } from "../lib/format";

const TABS = ["NOW.md", "TODO.md", "STATE.md"];

export default function Imp() {
  const [files, setFiles]     = useState<ImpFile[]>([]);
  const [active, setActive]   = useState<string>("NOW.md");
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft]     = useState<string>("");
  const [saving, setSaving]   = useState<boolean>(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState<boolean>(false);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const data = await getImpFiles();
      setFiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }

  const current = files.find((f) => f.path === active);

  function startEdit() {
    setDraft(current?.content || "");
    setEditing(true);
    setSaved(false);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await putImpFile(active, draft);
      setFiles((prev) =>
        prev.map((f) => (f.path === active ? { ...f, content: draft } : f))
      );
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">IMP</h1>
        {current?.updated_at && (
          <span className="text-xs text-amber-400">synced {fmtDate(current.updated_at)}</span>
        )}
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-3">{error}</p>
      )}

      <div className="flex border-b border-slate-800 mb-4">
        {TABS.map((tab) => {
          const found = files.some((f) => f.path === tab);
          return (
            <button
              key={tab}
              onClick={() => { setActive(tab); setEditing(false); }}
              className={`px-4 py-2 text-sm border-b-2 transition-colors ${
                active === tab
                  ? "border-sky-400 text-white"
                  : "border-transparent text-slate-400 hover:text-white"
              } ${!found ? "opacity-40" : ""}`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {!current ? (
        <p className="text-slate-500 text-sm">
          {active} not synced yet. Run bridge.py to import IMP docs.
        </p>
      ) : editing ? (
        <div className="space-y-3">
          <textarea
            className="w-full bg-slate-900 border border-slate-700 text-slate-100 text-sm font-mono p-3 focus:outline-none focus:border-sky-500 resize-y"
            rows={30}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-sky-600 text-white text-sm hover:bg-sky-500 disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={cancelEdit}
              className="px-4 py-2 text-slate-400 text-sm hover:text-white"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-amber-400">
            Saves to Supabase. bridge.py will write back to disk on next run.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={startEdit}
              className="text-xs text-sky-400 hover:text-sky-300 underline underline-offset-4"
            >
              Edit
            </button>
          </div>
          {saved && (
            <p className="text-emerald-400 text-xs">Saved.</p>
          )}
          <pre className="bg-slate-900 border border-slate-800 p-4 text-sm text-slate-200 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
            {current.content || "(empty)"}
          </pre>
        </div>
      )}
    </div>
  );
}
