import { json, sbFetch, sha256Hex, intParam } from "../_lib.js";

// GET /api/chunks?q=&session=&project=&limit=&offset=
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const q = u.searchParams.get("q");
  const session = u.searchParams.get("session");
  const project = u.searchParams.get("project");
  const limit = intParam(u.searchParams, "limit", 50, 200);
  const offset = intParam(u.searchParams, "offset", 0);

  const p = new URLSearchParams();
  p.set("select", "id,session_id,project_id,source_type,speaker,content,ts,sensitivity,created_at");
  if (q) p.set("fts", `wfts.${q}`); // websearch_to_tsquery over the generated fts column
  if (session) p.set("session_id", `eq.${session}`);
  if (project) p.set("project_id", `eq.${project}`);
  p.set("order", session ? "ts.asc.nullslast" : "ts.desc.nullslast");
  p.set("limit", String(limit));
  p.set("offset", String(offset));

  const { status, data } = await sbFetch(env, `chunks?${p.toString()}`);
  return json(data, status);
}

// POST /api/chunks — manual ingest (notes dropped into the vault by hand)
export async function onRequestPost({ request, env }) {
  const body = await request.json();
  if (!body.content || typeof body.content !== "string") {
    return json({ error: "content (string) is required" }, 400);
  }
  const ts = body.ts || new Date().toISOString();
  const row = {
    session_id: body.session_id ?? null,
    project_id: body.project_id ?? null,
    source_type: body.source_type || "room",
    source_ref: body.source_ref || { origin: "manual", via: "api" },
    speaker: body.speaker || "mandy",
    content: body.content,
    content_hash: body.content_hash || (await sha256Hex(`manual|${ts}|${body.content}`)),
    ts,
    sensitivity: body.sensitivity ?? 1,
  };
  const { status, data } = await sbFetch(env, "chunks?on_conflict=content_hash", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify(row),
  });
  return json(data ?? { ok: status < 300 }, status);
}
