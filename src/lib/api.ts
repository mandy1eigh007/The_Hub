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
