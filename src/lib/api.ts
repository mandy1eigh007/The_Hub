// Typed fetch wrappers for every Cloudflare Function endpoint.
import { getStoredSession, refreshSession, clearSession } from "./auth";

export interface Project {
  id: string;
  slug: string;
  name: string | null;
  created_at?: string;
}

export interface Session {
  id: string;
  project_id: string | null;
  agent: string | null;
  transcript_path: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  projects?: Pick<Project, "id" | "slug" | "name"> | null;
}

export type Speaker = "mandy" | "claude" | "codex" | "fable" | "chatgpt" | "system";

export interface Chunk {
  id: string;
  session_id: string | null;
  project_id: string | null;
  source_type: "transcript" | "imp" | "room" | "notion" | null;
  speaker: Speaker | null;
  content: string;
  ts: string | null;
  sensitivity: number;
  created_at: string;
  sessions?: { transcript_path: string | null; started_at: string | null } | null;
}

export interface Decision {
  id: string;
  session_id: string | null;
  project_id: string | null;
  content: string;
  accepted: boolean | null;
  ts: string | null;
  created_at: string;
  projects?: Pick<Project, "slug" | "name"> | null;
}

export interface OpenLoop {
  id: string;
  session_id: string | null;
  project_id: string | null;
  content: string;
  resolved: boolean;
  ts: string | null;
  created_at: string;
  projects?: Pick<Project, "slug" | "name"> | null;
}

export interface SessionDetail {
  session: Session;
  chunks: Chunk[];
}

export interface SearchResults {
  query: string;
  chunks: Chunk[];
  decisions: Decision[];
  open_loops: OpenLoop[];
}

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const session = getStoredSession();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });

  if (res.status === 401 && !retried) {
    const refreshed = await refreshSession();
    if (refreshed) return request<T>(path, init, true);
    clearSession();
    window.location.assign("/login");
    throw new Error("Session expired");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
  }
  return data as T;
}

// Exported for pages that need authenticated fetch with auto-refresh.
export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init);
}

export function getChunks(opts: {
  q?: string;
  session?: string;
  project?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Chunk[]> {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.session) p.set("session", opts.session);
  if (opts.project) p.set("project", opts.project);
  if (opts.limit != null) p.set("limit", String(opts.limit));
  if (opts.offset != null) p.set("offset", String(opts.offset));
  const qs = p.toString();
  return request<Chunk[]>(`/api/chunks${qs ? `?${qs}` : ""}`);
}

export function postChunk(chunk: {
  content: string;
  speaker?: Speaker;
  source_type?: Chunk["source_type"];
  session_id?: string;
  project_id?: string;
  ts?: string;
  sensitivity?: number;
}): Promise<Chunk[]> {
  return request<Chunk[]>("/api/chunks", { method: "POST", body: JSON.stringify(chunk) });
}

export function getSessions(): Promise<Session[]> {
  return request<Session[]>("/api/sessions");
}

export function getSessionDetail(id: string): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`);
}

export function getDecisions(project?: string): Promise<Decision[]> {
  const qs = project ? `?project=${encodeURIComponent(project)}` : "";
  return request<Decision[]>(`/api/decisions${qs}`);
}

export function getOpenLoops(): Promise<OpenLoop[]> {
  return request<OpenLoop[]>("/api/open-loops");
}

export function setLoopResolved(id: string, resolved: boolean): Promise<OpenLoop[]> {
  return request<OpenLoop[]>("/api/open-loops", {
    method: "PATCH",
    body: JSON.stringify({ id, resolved }),
  });
}

export function search(q: string): Promise<SearchResults> {
  return request<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`);
}

// ── Room ─────────────────────────────────────────────────────────────────────

export interface RoomMessage {
  id: string;
  speaker: Speaker | null;
  content: string;
  ts: string | null;
  turn_id: number | null;
  origin: "room_file" | "hub";
  created_at: string;
}

export function getRoomMessages(opts: { since?: string; tail?: boolean; limit?: number } = {}): Promise<RoomMessage[]> {
  const p = new URLSearchParams();
  if (opts.since) p.set("since", opts.since);
  if (opts.tail)  p.set("tail", "1");
  if (opts.limit) p.set("limit", String(opts.limit));
  return request<RoomMessage[]>(`/api/room${p.toString() ? `?${p}` : ""}`);
}

export function postRoomMessage(content: string, speaker: Speaker = "mandy"): Promise<RoomMessage> {
  return request<RoomMessage>("/api/room", {
    method: "POST",
    body: JSON.stringify({ content, speaker }),
  });
}

// ── Wire ─────────────────────────────────────────────────────────────────────

export interface WireMessage {
  id: string;
  ts: string | null;
  speaker: string | null;
  kind: string | null;
  re: string | null;
  content: string;
  artifact: string | null;
  created_at: string;
}

export function getWireMessages(opts: { since?: string } = {}): Promise<WireMessage[]> {
  const p = new URLSearchParams();
  if (opts.since) p.set("since", opts.since);
  return request<WireMessage[]>(`/api/wire${p.toString() ? `?${p}` : ""}`);
}

// ── Live Tail ─────────────────────────────────────────────────────────────────

export interface TailLine {
  id: string;
  session_path: string;
  line_index: number;
  speaker: string | null;
  role: string | null;
  content: string;
  ts: string | null;
}

export function getTailLines(opts: { since?: string; limit?: number } = {}): Promise<TailLine[]> {
  const p = new URLSearchParams();
  if (opts.since) p.set("since", opts.since);
  if (opts.limit) p.set("limit", String(opts.limit));
  return request<TailLine[]>(`/api/tail${p.toString() ? `?${p}` : ""}`);
}

// ── IMP ───────────────────────────────────────────────────────────────────────

export interface ImpFile {
  id: string;
  path: string;
  content: string | null;
  sha256: string | null;
  sensitivity: number;
  updated_at: string;
}

export function getImpFiles(): Promise<ImpFile[]> {
  return request<ImpFile[]>("/api/imp");
}

export function getImpFile(filename: string): Promise<ImpFile> {
  return request<ImpFile>(`/api/imp/${encodeURIComponent(filename)}`);
}

export function putImpFile(filename: string, content: string): Promise<unknown> {
  return request(`/api/imp/${encodeURIComponent(filename)}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

// ── ChatGPT ───────────────────────────────────────────────────────────────────

export interface ChatThread {
  id: string;
  title: string | null;
  session_id: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  ts: string;
}

export interface ChatReply {
  thread_id: string;
  thread_title: string | null;
  reply: string;
}

export function getChatThreads(): Promise<ChatThread[]> {
  return request<ChatThread[]>("/api/chatgpt");
}

export function getChatThread(threadId: string): Promise<{ thread: ChatThread; messages: ChatMessage[] }> {
  return request(`/api/chatgpt/${threadId}`);
}

export function sendChatMessage(opts: {
  message: string;
  thread_id?: string;
  title?: string;
  session_id?: string;
}): Promise<ChatReply> {
  return request<ChatReply>("/api/chatgpt", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

// ── Notion ────────────────────────────────────────────────────────────────────

export interface NotionResult {
  id: string;
  title: string;
  url: string;
  edited?: string;
  snippet?: string;
}

export function searchNotion(q: string): Promise<{ query: string; results: NotionResult[] }> {
  return request(`/api/notion?q=${encodeURIComponent(q)}`);
}

export function getNotionPage(id: string): Promise<NotionResult & { blocks: unknown[] }> {
  return request(`/api/notion?id=${encodeURIComponent(id)}`);
}

// ── GitHub ────────────────────────────────────────────────────────────────────

export interface GitHubPR {
  id: number;
  title: string;
  repo: string;
  state: string;
  updated_at: string;
  url: string;
  labels: string[];
}

export interface GitHubCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubRepo {
  full_name: string;
  description: string | null;
  pushed_at: string;
  open_issues: number;
  default_branch: string;
  html_url: string;
}

export function getGitHubPRs(): Promise<GitHubPR[]> {
  return request<GitHubPR[]>("/api/github?type=prs");
}

export function getGitHubRepos(): Promise<GitHubRepo[]> {
  return request<GitHubRepo[]>("/api/github?type=repos");
}

export function getGitHubCommits(repo: string): Promise<GitHubCommit[]> {
  return request<GitHubCommit[]>(`/api/github?type=commits&repo=${encodeURIComponent(repo)}`);
}

// ── Obsidian ──────────────────────────────────────────────────────────────────

export interface ObsidianNote {
  id: string;
  path: string;
  title: string | null;
  content?: string;
  tags: string[] | null;
  updated_at: string;
}

export function searchObsidian(q: string): Promise<{ query: string; results: ObsidianNote[] }> {
  return request(`/api/obsidian?q=${encodeURIComponent(q)}`);
}

export function getObsidianNote(id: string): Promise<ObsidianNote> {
  return request<ObsidianNote>(`/api/obsidian?id=${encodeURIComponent(id)}`);
}
