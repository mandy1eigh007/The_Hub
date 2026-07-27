import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/tail          - latest live_tail entries across all sessions
// GET /api/tail?since=ts - entries after timestamp (for polling)

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const limit = intParam(u.searchParams, "limit", 100, 200);
  const since = u.searchParams.get("since");

  const p = new URLSearchParams();
  p.set("select", "id,session_path,line_index,speaker,role,content,ts");
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
