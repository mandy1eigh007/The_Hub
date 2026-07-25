import { json, sbFetch, intParam } from "../_lib.js";

// GET  /api/tasks              - list all tasks
// POST /api/tasks              - create a task
// PATCH /api/tasks             - update status/notes/priority
// DELETE /api/tasks?id=uuid    - delete a task

export async function onRequestGet({ request, env }) {
  const u      = new URL(request.url);
  const status = u.searchParams.get("status");
  const p      = new URLSearchParams();
  p.set("select", "id,title,notes,status,priority,project,due_date,created_at,updated_at,done_at");
  p.set("order",  "created_at.desc");
  p.set("limit",  "200");
  if (status) p.set("status", `eq.${status}`);

  const { status: s, data } = await sbFetch(env, `hub_tasks?${p.toString()}`);
  return json(data, s);
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { title, notes, priority = "normal", project, due_date } = body;
  if (!title?.trim()) return json({ error: "title required" }, 400);

  const { status, data } = await sbFetch(env, "hub_tasks", {
    method: "POST",
    body:   JSON.stringify({ title: title.trim(), notes, priority, project, due_date }),
    headers: { Prefer: "return=representation" },
  });
  return json(Array.isArray(data) ? data[0] : data, status === 201 ? 201 : status);
}

export async function onRequestPatch({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { id, ...fields } = body;
  if (!id) return json({ error: "id required" }, 400);

  // Auto-stamp done_at
  if (fields.status === "done" && !fields.done_at) {
    fields.done_at = new Date().toISOString();
  } else if (fields.status && fields.status !== "done") {
    fields.done_at = null;
  }
  fields.updated_at = new Date().toISOString();

  const { status, data } = await sbFetch(env, `hub_tasks?id=eq.${id}`, {
    method: "PATCH",
    body:   JSON.stringify(fields),
    headers: { Prefer: "return=representation" },
  });
  return json(Array.isArray(data) ? data[0] : data, status);
}

export async function onRequestDelete({ request, env }) {
  const u  = new URL(request.url);
  const id = u.searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);

  const { status, data } = await sbFetch(env, `hub_tasks?id=eq.${id}`, { method: "DELETE" });
  return json({ ok: true }, status === 204 ? 200 : status);
}
