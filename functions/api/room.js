import { json, sbFetch, intParam } from "../_lib.js";

// GET  /api/room          - paginated room messages, newest first
// POST /api/room          - post a new message from the Hub
// GET  /api/room?tail=1   - last 50 messages for polling (newest last)

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const limit  = intParam(u.searchParams, "limit", 100, 500);
  const offset = intParam(u.searchParams, "offset", 0);
  const tail   = u.searchParams.get("tail") === "1";
  const since  = u.searchParams.get("since"); // ISO timestamp for polling

  const p = new URLSearchParams();
  p.set("select", "id,speaker,content,ts,turn_id,origin,created_at");
  if (since) {
    p.set("ts", `gte.${since}`);
    p.set("order", "ts.asc");
  } else if (tail) {
    p.set("order", "ts.asc.nullslast");
    p.set("limit", "50");
  } else {
    p.set("order", "ts.desc.nullslast");
    p.set("limit", String(limit));
    p.set("offset", String(offset));
  }

  const { status, data } = await sbFetch(env, `room_messages?${p.toString()}`);
  return json(data, status);
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { speaker = "mandy", content, turn_id } = body;
  if (!content || !content.trim()) {
    return json({ error: "content required" }, 400);
  }

  const row = {
    speaker:  speaker,
    content:  content.trim(),
    ts:       new Date().toISOString(),
    origin:   "hub",
  };
  if (turn_id != null) row.turn_id = turn_id;

  const { status, data } = await sbFetch(env, "room_messages", {
    method: "POST",
    body:   JSON.stringify(row),
    headers: { Prefer: "return=representation" },
  });

  if (status !== 200 && status !== 201) {
    return json({ error: "Failed to post message", detail: data }, status);
  }
  return json(Array.isArray(data) ? data[0] : data, 201);
}
