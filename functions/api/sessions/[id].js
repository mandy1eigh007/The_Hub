import { json, sbFetch } from "../../_lib.js";

// GET /api/sessions/:id — single session with all its chunks in order
export async function onRequestGet({ env, params }) {
  const id = params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Invalid session id" }, 400);

  const [sessionRes, chunksRes] = await Promise.all([
    sbFetch(env, `sessions?id=eq.${id}&select=*,projects(id,slug,name)`),
    sbFetch(
      env,
      `chunks?session_id=eq.${id}` +
        `&select=id,speaker,source_type,content,ts,sensitivity,created_at` +
        `&order=ts.asc.nullslast&limit=5000`
    ),
  ]);

  const session = Array.isArray(sessionRes.data) ? sessionRes.data[0] : null;
  if (!session) return json({ error: "Session not found" }, 404);

  return json({ session, chunks: Array.isArray(chunksRes.data) ? chunksRes.data : [] });
}
