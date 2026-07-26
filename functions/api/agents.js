import { json, sbFetch } from "../_lib.js";

const MAX_BODY_BYTES = 512 * 1024;
const PROVIDER_TIMEOUT_MS = 30_000;

const AGENTS = {
  claude:  { provider: "anthropic", model: "claude-sonnet-4-6" },
  fable:   { provider: "anthropic", model: "claude-fable-5" },
  codex:   { provider: "openai",    model: "o4-mini",  reasoning: true },
  chatgpt: { provider: "openai",    model: "gpt-4.1" },
};

const MAX_HISTORY = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validAgent(agent) {
  return typeof agent === "string" && Object.prototype.hasOwnProperty.call(AGENTS, agent);
}

function isValidUUID(s) {
  return typeof s === "string" && UUID_RE.test(s);
}

function systemPrompt(agent) {
  const names = { claude: "Claude", fable: "Fable", codex: "Codex", chatgpt: "ChatGPT" };
  return `You are ${names[agent]}, one of four AI agents in The Hub — a personal AI command center. Be direct, concise, and helpful.`;
}

async function callAnthropic(env, agent, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AGENTS[agent].model,
        max_tokens: 2048,
        system: systemPrompt(agent),
        messages,
      }),
    });
    if (!res.ok) throw new Error("Anthropic error");
    const data = await res.json();
    // Handle refusals: stop_reason "refusal" or empty content array
    if (data.stop_reason === "refusal" || !data.content?.length) {
      return "[This request was declined.]";
    }
    return data.content[0].text;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(env, agent, messages) {
  const config = AGENTS[agent];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const body = {
      model: config.model,
      messages: [{ role: "system", content: systemPrompt(agent) }, ...messages],
      ...(config.reasoning ? { max_completion_tokens: 2048 } : { max_tokens: 2048 }),
    };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("OpenAI error");
    const data = await res.json();
    return data.choices[0].message.content;
  } finally {
    clearTimeout(timer);
  }
}

// Race-safe: UNIQUE(agent) on the table + ignore-duplicates upsert
async function getOrCreateThread(env, agent) {
  const { data, ok } = await sbFetch(env, "agents_threads", {
    method: "POST",
    body: JSON.stringify({ agent }),
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
  });
  if (ok && Array.isArray(data) && data.length) return data[0];
  // Conflict: fetch existing
  const { data: existing, ok: getOk } = await sbFetch(env, `agents_threads?agent=eq.${encodeURIComponent(agent)}&limit=1`);
  if (getOk && existing?.length) return existing[0];
  throw new Error("Thread unavailable");
}

// GET /api/agents?agent=claude  → { thread, messages } (newest 200, chronological)
// GET /api/agents?all=1         → AgentMessage[] merged, newest 200, chronological
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const agent = u.searchParams.get("agent");
  const all   = u.searchParams.get("all");

  if (all) {
    const { data, ok } = await sbFetch(env, "agents_messages?order=created_at.desc&limit=200");
    if (!ok) return json({ error: "Failed to load feed" }, 502);
    return json((data || []).reverse());
  }

  if (!validAgent(agent)) return json({ error: "agent required" }, 400);
  const thread = await getOrCreateThread(env, agent);
  const { data: messages, ok } = await sbFetch(env, `agents_messages?thread_id=eq.${thread.id}&order=created_at.desc&limit=200`);
  if (!ok) return json({ error: "Failed to load messages" }, 502);
  return json({ thread, messages: (messages || []).reverse() });
}

// POST /api/agents { agent, message, thread_id? } → { thread_id, user_message, reply }
export async function onRequestPost({ request, env }) {
  // Body size guard (Cloudflare best practice)
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { agent, message, thread_id } = body;
  if (!validAgent(agent)) return json({ error: "unknown agent" }, 400);
  if (typeof message !== "string" || !message.trim() || message.length > 4000) return json({ error: "message required (1–4000 chars)" }, 400);
  if (thread_id !== undefined && !isValidUUID(thread_id)) return json({ error: "invalid thread_id" }, 400);

  // Resolve and verify thread ownership to prevent cross-agent history leak
  let threadId;
  if (thread_id) {
    const { data: owned, ok } = await sbFetch(env, `agents_threads?id=eq.${thread_id}&agent=eq.${encodeURIComponent(agent)}&limit=1`);
    if (!ok) return json({ error: "Thread lookup failed" }, 502);
    if (!owned?.length) return json({ error: "thread not found" }, 404);
    threadId = thread_id;
  } else {
    const thread = await getOrCreateThread(env, agent);
    threadId = thread.id;
  }

  // Fetch history
  const { data: history, ok: histOk } = await sbFetch(env, `agents_messages?thread_id=eq.${threadId}&order=created_at.desc&limit=${MAX_HISTORY}`);
  if (!histOk) return json({ error: "Failed to load history" }, 502);
  const pastMessages = (history || []).reverse().map((m) => ({ role: m.role, content: m.content }));

  // Call provider BEFORE inserting anything — prevents ghost messages on failure
  let replyText;
  try {
    const conversationMessages = [...pastMessages, { role: "user", content: message.trim() }];
    replyText = AGENTS[agent].provider === "anthropic"
      ? await callAnthropic(env, agent, conversationMessages)
      : await callOpenAI(env, agent, conversationMessages);
  } catch {
    return json({ error: "AI provider unavailable — try again." }, 502);
  }

  // Persist both turns only after successful provider response
  const { data: userMsgArr, ok: userOk } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, agent, role: "user", content: message.trim() }),
    headers: { Prefer: "return=representation" },
  });
  if (!userOk) return json({ error: "Failed to save message" }, 502);
  const userMsg = Array.isArray(userMsgArr) ? userMsgArr[0] : userMsgArr;

  const { data: replyMsgArr, ok: replyOk } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, agent, role: "assistant", content: replyText }),
    headers: { Prefer: "return=representation" },
  });
  if (!replyOk) {
    // Compensating delete — keeps threads free of orphaned user messages
    await sbFetch(env, `agents_messages?id=eq.${userMsg.id}`, { method: "DELETE" });
    return json({ error: "Failed to save reply" }, 502);
  }
  const replyMsg = Array.isArray(replyMsgArr) ? replyMsgArr[0] : replyMsgArr;

  return json({ thread_id: threadId, user_message: userMsg, reply: replyMsg });
}

// DELETE /api/agents?thread_id=uuid  → clears messages for that thread
export async function onRequestDelete({ request, env }) {
  const u = new URL(request.url);
  const threadId = u.searchParams.get("thread_id");
  if (!isValidUUID(threadId)) return json({ error: "valid thread_id required" }, 400);
  const { ok } = await sbFetch(env, `agents_messages?thread_id=eq.${threadId}`, { method: "DELETE" });
  if (!ok) return json({ error: "Delete failed" }, 502);
  return json({ ok: true });
}
