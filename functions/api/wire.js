import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/wire          - paginated wire messages (Claude <-> Codex traffic)
// GET /api/wire?since=ts - messages after timestamp (for polling)
// POST /api/wire         - Hub ACK only; speaker/kind/content are hardcoded

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

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const re = body.re ?? null;

  const row = {
    ts: new Date().toISOString(),
    speaker: "hub",
    kind: "ack",
    ...(re ? { re } : {}),
    content: "Received.",
  };

  const { status, data } = await sbFetch(env, "wire_messages", {
    method: "POST",
    headers: { "Prefer": "return=representation" },
    body: JSON.stringify(row),
  });
  return json(data, status);
}
