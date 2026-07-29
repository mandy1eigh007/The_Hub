import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/tail               - latest live_tail entries across all sessions
// GET /api/tail?agent=claude  - Claude Tail only
// GET /api/tail?agent=codex   - Codex Tail only
// GET /api/tail?since=ts      - entries after timestamp (for polling)

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const limit = intParam(u.searchParams, "limit", 100, 200);
  const since = u.searchParams.get("since");
  const agent = u.searchParams.get("agent") || "all";
  if (!["all", "claude", "codex"].includes(agent)) {
    return json({ error: "agent must be 'all', 'claude', or 'codex'" }, 400);
  }

  const p = new URLSearchParams();
  p.set("select", "id,session_path,line_index,speaker,role,content,ts");
  // Codex hook rows use an explicit prefix. Existing and future Claude session
  // paths remain the Claude Tail without requiring a schema migration.
  if (agent === "codex") p.set("session_path", "like.codex:*");
  if (agent === "claude") p.set("session_path", "not.like.codex:*");
  if (since) {
    p.set("ts", `gt.${since}`);          // exclusive — skip the row we already have
    p.set("order", "ts.asc,line_index.asc");
  } else {
    p.set("order", "ts.desc,line_index.desc");
    p.set("limit", String(limit));
  }

  const { status, data } = await sbFetch(env, `live_tail?${p.toString()}`);
  // Initial load comes back desc; reverse to chronological. Polling comes back asc; leave it.
  const rows = Array.isArray(data) ? (since ? data : data.reverse()) : data;
  return json(rows, status);
}
