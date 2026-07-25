import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/obsidian?q=search    - FTS search across synced Obsidian notes
// GET /api/obsidian?id=uuid     - get a single note by id
// GET /api/obsidian             - list recent notes (no query)

export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const q     = u.searchParams.get("q");
  const id    = u.searchParams.get("id");
  const limit = intParam(u.searchParams, "limit", 20, 100);

  if (id) {
    const { status, data } = await sbFetch(env, `obsidian_notes?id=eq.${id}&select=id,path,title,content,tags,updated_at&limit=1`);
    const note = Array.isArray(data) ? data[0] : null;
    if (!note) return json({ error: "Not found" }, 404);
    return json(note, status);
  }

  const p = new URLSearchParams();
  p.set("select", "id,path,title,tags,updated_at");
  p.set("limit", String(limit));

  if (q) {
    const pFts = new URLSearchParams();
    pFts.set("select", "id,path,title,tags,updated_at");
    pFts.set("fts", `phfts(english).${q}`);
    pFts.set("order", "updated_at.desc");
    pFts.set("limit", String(limit));
    const { status, data } = await sbFetch(env, `obsidian_notes?${pFts.toString()}`);
    return json({ query: q, results: data || [] }, status);
  }

  p.set("order", "updated_at.desc");
  const { status, data } = await sbFetch(env, `obsidian_notes?${p.toString()}`);
  return json(data, status);
}
