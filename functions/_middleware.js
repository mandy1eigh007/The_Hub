// Runs on every request. Verifies the Supabase Auth JWT for all /api/* routes
// except the auth proxy itself, then attaches the user to context.data.
import { json } from "./_lib.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Static assets and the SPA pass through untouched.
  if (!url.pathname.startsWith("/api/")) return next();

  if (!env.SUPABASE_URL || !env.HUB_SERVICE_KEY) {
    return json({ error: "Server not configured: missing SUPABASE_URL or HUB_SERVICE_KEY" }, 500);
  }

  try {
    // The auth proxy must be reachable without a session (login, refresh).
    if (url.pathname.startsWith("/api/auth/")) return await next();

    const header = request.headers.get("Authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return json({ error: "Missing bearer token" }, 401);

    // Verify against Supabase Auth — no local key material, no JWKS caching.
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.HUB_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return json({ error: "Invalid or expired token" }, 401);

    context.data.user = await res.json();
    return await next();
  } catch (e) {
    return json({ error: "Internal error", detail: String(e) }, 500);
  }
}
