import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/decisions?project=
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const project = u.searchParams.get("project");
  const limit = intParam(u.searchParams, "limit", 200, 500);
  const p = new URLSearchParams();
  p.set("select", "id,session_id,project_id,content,accepted,ts,created_at,projects(slug,name)");
  if (project) p.set("project_id", `eq.${project}`);
  p.set("order", "ts.desc.nullslast");
  p.set("limit", String(limit));
  const { status, data } = await sbFetch(env, `decisions?${p.toString()}`);
  return json(data, status);
}
