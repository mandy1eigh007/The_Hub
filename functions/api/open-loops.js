import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/open-loops — all loops (client filters resolved/unresolved)
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const project = u.searchParams.get("project");
  const limit = intParam(u.searchParams, "limit", 300, 500);
  const p = new URLSearchParams();
  p.set("select", "id,session_id,project_id,content,resolved,ts,created_at,projects(slug,name)");
  if (project) p.set("project_id", `eq.${project}`);
  p.set("order", "created_at.desc");
  p.set("limit", String(limit));
  const { status, data } = await sbFetch(env, `open_loops?${p.toString()}`);
  return json(data, status);
}

// PATCH /api/open-loops — body { id, resolved } — mark a loop resolved/reopened
export async function onRequestPatch({ request, env }) {
  const body = await request.json();
  if (!body.id || typeof body.resolved !== "boolean") {
    return json({ error: "id and resolved (boolean) are required" }, 400);
  }
  const { status, data } = await sbFetch(env, `open_loops?id=eq.${body.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ resolved: body.resolved }),
  });
  return json(data, status);
}
