import { json, sbFetch } from "../../_lib.js";

// GET /api/imp/:file  - get a single IMP document by path/filename
// PUT /api/imp/:file  - update content (bridge.py will write back to disk)

export async function onRequestGet({ params, env }) {
  const filename = decodeURIComponent(params.file);
  const p = new URLSearchParams();
  p.set("select", "id,path,content,sha256,sensitivity,updated_at");
  p.set("path", `eq.${filename}`);
  p.set("limit", "1");

  const { status, data } = await sbFetch(env, `imp_files?${p.toString()}`);
  if (!Array.isArray(data) || data.length === 0) {
    return json({ error: "Not found" }, 404);
  }
  return json(data[0], status);
}

export async function onRequestPut({ params, request, env }) {
  const filename = decodeURIComponent(params.file);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { content } = body;
  if (typeof content !== "string") {
    return json({ error: "content (string) required" }, 400);
  }

  const { status, data } = await sbFetch(env, `imp_files?path=eq.${encodeURIComponent(filename)}`, {
    method: "PATCH",
    body: JSON.stringify({
      content,
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=representation" },
  });

  return json(data, status);
}
