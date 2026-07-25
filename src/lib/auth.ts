// Auth client. Talks only to our own /api/auth/* proxy — the browser never
// holds any Supabase key at all (not even the anon key). Tokens live in
// localStorage; the api layer attaches them and auto-refreshes on 401.

const STORAGE_KEY = "hub_auth";

export interface AuthUser {
  id: string;
  email?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user?: AuthUser;
}

export function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AuthSession;
    return s.access_token ? s : null;
  } catch {
    return null;
  }
}

function store(session: AuthSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAuthed(): boolean {
  return getStoredSession() !== null;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.msg || data.error || "Login failed");
  }
  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    user: data.user ? { id: data.user.id, email: data.user.email } : undefined,
  };
  store(session);
  return session;
}

export async function refreshSession(): Promise<AuthSession | null> {
  const current = getStoredSession();
  if (!current?.refresh_token) return null;
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) return null;
    const session: AuthSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? current.refresh_token,
      expires_at: data.expires_at,
      user: data.user ? { id: data.user.id, email: data.user.email } : current.user,
    };
    store(session);
    return session;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  const current = getStoredSession();
  if (current) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${current.access_token}` },
      });
    } catch {
      // Local sign-out still proceeds if the network call fails.
    }
  }
  clearSession();
}
