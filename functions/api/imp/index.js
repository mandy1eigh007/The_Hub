import { json, sbFetch } from "../../_lib.js";

// GET /api/imp - list synced IMP documents

export async function onRequestGet({ env }) {
  const p = new URLSearchParams();
  p.set("select", "id,path,content,sha256,sensitivity,updated_at");
  p.set("order", "path.asc");

  const { status, data } = await sbFetch(env, `imp_files?${p.toString()}`);
  return json(data, status);
}
