import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/sessions — newest first, with project info joined for grouping
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const limit = intParam(u.searchParams, "limit", 200, 500);
  const p = new URLSearchParams();
  p.set("select", "id,project_id,agent,transcript_path,started_at,ended_at,created_at,projects(id,slug,name)");
  p.set("order", "started_at.desc.nullslast");
  p.set("limit", String(limit));
  const { status, data } = await sbFetch(env, `sessions?${p.toString()}`);
  return json(data, status);
}
