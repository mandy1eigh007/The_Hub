import { useEffect, useState } from "react";
import { fmtDate } from "../lib/format";
import { apiFetch } from "../lib/api";

interface HubTask {
  id: string;
  title: string;
  notes: string | null;
  status: "todo" | "doing" | "done" | "blocked";
  priority: "high" | "normal" | "low";
  project: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

const STATUS_CONFIG = {
  todo:    { label: "TO DO",   bg: "bg-slate-700",   text: "text-slate-200",  ring: "border-slate-600",  dot: "bg-slate-400" },
  doing:   { label: "DOING",   bg: "bg-yellow-500/20",text: "text-yellow-300", ring: "border-yellow-500/40",dot: "bg-yellow-400" },
  done:    { label: "DONE",    bg: "bg-emerald-500/20",text: "text-emerald-300",ring: "border-emerald-500/40",dot: "bg-emerald-400" },
  blocked: { label: "BLOCKED", bg: "bg-red-500/20",   text: "text-red-300",   ring: "border-red-500/40",  dot: "bg-red-400" },
};

const STATUS_ORDER: HubTask["status"][] = ["doing", "todo", "blocked", "done"];

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)   return `${d}d ago`;
  return fmtDate(ts);
}

export default function Tasks() {
  const [tasks, setTasks]       = useState<HubTask[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding]     = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "normal" | "low">("normal");
  const [saving, setSaving]     = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await apiFetch<HubTask[]>("/api/tasks");
      setTasks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  async function moveStatus(task: HubTask, next: HubTask["status"]) {
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t));
    try {
      await apiFetch("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id: task.id, status: next }),
      });
    } catch {
      setTasks((prev) => prev.map((t) => t.id === task.id ? task : t));
    }
  }

  async function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await apiFetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    } catch {
      load();
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || saving) return;
    setSaving(true);
    try {
      const task = await apiFetch<HubTask>("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ title: newTitle.trim(), project: newProject || null, priority: newPriority }),
      });
      setTasks((prev) => [task, ...prev]);
      setNewTitle("");
      setNewProject("");
      setNewPriority("normal");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setSaving(false);
    }
  }

  const active = tasks.filter((t) => t.status !== "done");
  const done   = tasks.filter((t) => t.status === "done");

  // Group active by status
  const grouped = STATUS_ORDER.reduce<Record<string, HubTask[]>>((acc, s) => {
    acc[s] = active.filter((t) => t.status === s);
    return acc;
  }, {});

  // Project colors
  const projects = [...new Set(tasks.map((t) => t.project).filter(Boolean))] as string[];
  const projectColors = ["text-purple-400", "text-orange-400", "text-pink-400", "text-cyan-400", "text-lime-400"];
  const projectColor = (p: string) => projectColors[projects.indexOf(p) % projectColors.length];

  if (loading) return <p className="text-slate-400 p-8">Loading tasks...</p>;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Tasks</h1>
          <p className="text-slate-500 text-sm mt-1">
            {active.length} open &middot; {done.length} done
          </p>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="px-5 py-2.5 bg-sky-600 text-white font-semibold text-sm hover:bg-sky-500 transition-colors"
        >
          + Add Task
        </button>
      </div>

      {error && <p className="text-red-400 text-sm mb-4 px-4 py-2 bg-red-400/10 border border-red-400/20">{error}</p>}

      {/* Add task form */}
      {adding && (
        <form onSubmit={addTask} className="mb-6 bg-slate-900 border border-sky-500/40 p-4 space-y-3">
          <input
            autoFocus
            className="w-full bg-slate-800 border border-slate-700 text-white px-3 py-2.5 text-base focus:outline-none focus:border-sky-500 placeholder-slate-500"
            placeholder="What needs to happen?"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <div className="flex gap-3">
            <input
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 text-sm focus:outline-none focus:border-slate-500 placeholder-slate-600"
              placeholder="Project (optional)"
              value={newProject}
              onChange={(e) => setNewProject(e.target.value)}
            />
            <select
              className="bg-slate-800 border border-slate-700 text-slate-300 px-3 py-2 text-sm focus:outline-none"
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as "high" | "normal" | "low")}
            >
              <option value="high">High priority</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            <button type="submit" disabled={saving || !newTitle.trim()}
              className="px-4 py-2 bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 disabled:opacity-40">
              {saving ? "..." : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="px-4 py-2 text-slate-400 text-sm hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Status columns — DOING first */}
      {STATUS_ORDER.filter((s) => s !== "done").map((status) => {
        const items = grouped[status];
        if (items.length === 0) return null;
        const cfg = STATUS_CONFIG[status];
        return (
          <div key={status} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs font-bold tracking-widest ${cfg.text}`}>{cfg.label}</span>
              <span className="text-slate-600 text-xs">{items.length}</span>
            </div>

            <div className="space-y-2">
              {items.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  projectColor={task.project ? projectColor(task.project) : null}
                  onMove={moveStatus}
                  onDelete={deleteTask}
                />
              ))}
            </div>
          </div>
        );
      })}

      {active.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl font-bold text-emerald-400 mb-2">ALL CLEAR</p>
          <p className="text-slate-500">No open tasks. Add one above.</p>
        </div>
      )}

      {/* Done section (collapsed) */}
      {done.length > 0 && (
        <div className="mt-8 border-t border-slate-800 pt-4">
          <button
            onClick={() => setShowDone(!showDone)}
            className="flex items-center gap-2 text-slate-500 text-sm hover:text-white mb-3"
          >
            <span>Done ({done.length}) {showDone ? "[-]" : "[+]"}</span>
          </button>
          {showDone && (
            <div className="space-y-2 opacity-60">
              {done.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  projectColor={task.project ? projectColor(task.project) : null}
                  onMove={moveStatus}
                  onDelete={deleteTask}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, projectColor, onMove, onDelete }: {
  task: HubTask;
  projectColor: string | null;
  onMove: (t: HubTask, s: HubTask["status"]) => void;
  onDelete: (id: string) => void;
}) {
  const cfg      = STATUS_CONFIG[task.status];
  const nextMap: Record<string, HubTask["status"][]> = {
    todo:    ["doing", "done"],
    doing:   ["done", "blocked", "todo"],
    blocked: ["todo", "doing"],
    done:    ["todo"],
  };
  const nextOptions = nextMap[task.status] || [];

  return (
    <div className={`bg-slate-900 border ${cfg.ring} p-4 flex items-start gap-4 group`}>
      {/* Priority bar */}
      {task.priority === "high" && (
        <div className="w-1 self-stretch bg-red-500 rounded shrink-0" />
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-semibold text-base leading-snug ${task.status === "done" ? "line-through text-slate-500" : "text-white"}`}>
            {task.title}
          </p>
          {task.priority === "high" && (
            <span className="text-xs font-bold text-red-400 shrink-0">HIGH</span>
          )}
        </div>

        {task.notes && (
          <p className="text-slate-400 text-sm mt-1 leading-relaxed">{task.notes}</p>
        )}

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {task.project && (
            <span className={`text-xs font-mono ${projectColor || "text-slate-400"}`}>
              {task.project}
            </span>
          )}
          <span className="text-slate-600 text-xs">{timeAgo(task.created_at)}</span>
          {task.done_at && (
            <span className="text-emerald-600 text-xs">done {timeAgo(task.done_at)}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {nextOptions.map((next) => (
          <button
            key={next}
            onClick={() => onMove(task, next)}
            className={`text-xs px-2 py-1 border transition-colors ${STATUS_CONFIG[next].ring} ${STATUS_CONFIG[next].text} hover:${STATUS_CONFIG[next].bg} opacity-0 group-hover:opacity-100`}
            title={`Move to ${next}`}
          >
            {STATUS_CONFIG[next].label}
          </button>
        ))}
        <button
          onClick={() => onDelete(task.id)}
          className="text-xs text-slate-600 hover:text-red-400 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Delete"
        >
          del
        </button>
      </div>
    </div>
  );
}
