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

// Validate the browser's Supabase access token before a Function performs a write.
// Database calls still use the service key internally; this only establishes who may
// invoke the write endpoint.
export async function requireAuth(request, env) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return json({ error: "Unauthorized" }, 401);

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.HUB_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return json({ error: "Unauthorized" }, 401);
  } catch {
    return json({ error: "Authentication unavailable" }, 503);
  }

  return null;
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
