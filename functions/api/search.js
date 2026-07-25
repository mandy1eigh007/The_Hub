import { json, sbFetch, intParam } from "../_lib.js";

// GET /api/search?q= — full-text over chunks (tsvector), substring over
// decisions and open_loops (small tables, no fts column needed yet).
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") || "").trim();
  if (!q) return json({ error: "q is required" }, 400);
  const limit = intParam(u.searchParams, "limit", 50, 100);

  const chunkParams = new URLSearchParams();
  chunkParams.set(
    "select",
    "id,session_id,project_id,speaker,source_type,content,ts,created_at,sessions(transcript_path,started_at)"
  );
  chunkParams.set("fts", `wfts.${q}`);
  chunkParams.set("order", "ts.desc.nullslast");
  chunkParams.set("limit", String(limit));

  const likeParams = (extra) => {
    const p = new URLSearchParams();
    p.set("select", extra);
    p.set("content", `ilike.*${q}*`);
    p.set("order", "created_at.desc");
    p.set("limit", "50");
    return p;
  };

  const [chunks, decisions, loops] = await Promise.all([
    sbFetch(env, `chunks?${chunkParams.toString()}`),
    sbFetch(env, `decisions?${likeParams("id,session_id,project_id,content,accepted,ts,created_at").toString()}`),
    sbFetch(env, `open_loops?${likeParams("id,session_id,project_id,content,resolved,ts,created_at").toString()}`),
  ]);

  return json({
    query: q,
    chunks: Array.isArray(chunks.data) ? chunks.data : [],
    decisions: Array.isArray(decisions.data) ? decisions.data : [],
    open_loops: Array.isArray(loops.data) ? loops.data : [],
  });
}
