// Proxy for Supabase Auth. The browser never talks to Supabase directly and
// never holds any Supabase API key — the service key stays server-side and is
// only used as the required `apikey` header on auth endpoints.
import { json } from "../../_lib.js";

async function forward(res) {
  const text = await res.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return json(data, res.status === 204 ? 200 : res.status);
}

export async function onRequest({ request, env, params }) {
  const path = Array.isArray(params.path) ? params.path.join("/") : (params.path || "");
  const base = `${env.SUPABASE_URL}/auth/v1`;
  const apikey = { apikey: env.HUB_SERVICE_KEY, "Content-Type": "application/json" };

  if (path === "login" && request.method === "POST") {
    const { email, password } = await request.json();
    if (!email || !password) return json({ error: "email and password required" }, 400);
    const res = await fetch(`${base}/token?grant_type=password`, {
      method: "POST",
      headers: apikey,
      body: JSON.stringify({ email, password }),
    });
    return forward(res);
  }

  if (path === "refresh" && request.method === "POST") {
    const { refresh_token } = await request.json();
    if (!refresh_token) return json({ error: "refresh_token required" }, 400);
    const res = await fetch(`${base}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: apikey,
      body: JSON.stringify({ refresh_token }),
    });
    return forward(res);
  }

  if (path === "logout" && request.method === "POST") {
    const res = await fetch(`${base}/logout`, {
      method: "POST",
      headers: { ...apikey, Authorization: request.headers.get("Authorization") || "" },
    });
    if (res.status === 204) return json({ ok: true });
    return forward(res);
  }

  if (path === "user" && request.method === "GET") {
    const res = await fetch(`${base}/user`, {
      headers: { ...apikey, Authorization: request.headers.get("Authorization") || "" },
    });
    return forward(res);
  }

  return json({ error: "Not found" }, 404);
}
