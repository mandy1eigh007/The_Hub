import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/wire          - paginated wire messages (Claude <-> Codex traffic)
// GET /api/wire?since=ts - messages after timestamp (for polling)

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const limit = intParam(u.searchParams, "limit", 100, 500);
  const since = u.searchParams.get("since");

  const p = new URLSearchParams();
  p.set("select", "id,ts,speaker,kind,re,content,artifact,created_at");
  if (since) {
    p.set("created_at", `gt.${since}`);
    p.set("order", "created_at.asc");
  } else {
    p.set("order", "created_at.asc");
    p.set("limit", String(limit));
  }

  const { status, data } = await sbFetch(env, `wire_messages?${p.toString()}`);
  return json(data, status);
}
