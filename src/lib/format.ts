// Small display helpers shared by pages.
import type { Speaker } from "./api";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SPEAKER_COLORS: Record<string, string> = {
  mandy: "text-white",
  claude: "text-sky-300",
  codex: "text-emerald-300",
  fable: "text-violet-300",
  chatgpt: "text-amber-300",
  system: "text-slate-400",
};

export function speakerColor(speaker: Speaker | string | null | undefined): string {
  return (speaker && SPEAKER_COLORS[speaker]) || "text-slate-300";
}

export function speakerLabel(speaker: Speaker | string | null | undefined): string {
  return (speaker || "unknown").toUpperCase();
}
