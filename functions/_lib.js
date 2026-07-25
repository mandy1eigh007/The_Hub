// Shared helpers for Pages Functions. Underscore-prefixed files are not routed.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function sbHeaders(env, extra = {}) {
  return {
    apikey: env.HUB_SERVICE_KEY,
    Authorization: `Bearer ${env.HUB_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// GET/POST/PATCH against PostgREST with the service key. Returns { status, data }.
export async function sbFetch(env, path, init = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: sbHeaders(env, init.headers || {}),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { status: res.status, ok: res.ok, data };
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function intParam(searchParams, name, fallback, max) {
  const n = parseInt(searchParams.get(name) || "", 10);
  if (Number.isNaN(n) || n < 0) return fallback;
  return max ? Math.min(n, max) : n;
}
