import { json, sbFetch } from "../_lib.js";

const AGENTS = {
  claude:  { provider: "anthropic", model: "claude-sonnet-4-6" },
  fable:   { provider: "anthropic", model: "claude-fable-5" },
  codex:   { provider: "openai",    model: "o4-mini" },
  chatgpt: { provider: "openai",    model: "gpt-4o" },
};

const MAX_HISTORY = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(s) {
  return typeof s === "string" && UUID_RE.test(s);
}

function systemPrompt(agent) {
  const names = { claude: "Claude", fable: "Fable", codex: "Codex", chatgpt: "ChatGPT" };
  return `You are ${names[agent]}, one of four AI agents in The Hub — a personal AI command center. Be direct, concise, and helpful.`;
}

async function callAnthropic(env, agent, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
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
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(env, agent, messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: AGENTS[agent].model,
      messages: [{ role: "system", content: systemPrompt(agent) }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function getOrCreateThread(env, agent) {
  const { data: existing } = await sbFetch(env, `agents_threads?agent=eq.${agent}&order=created_at.desc&limit=1`);
  if (existing?.length) return existing[0];
  const { data } = await sbFetch(env, "agents_threads", {
    method: "POST",
    body: JSON.stringify({ agent }),
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(data) ? data[0] : data;
}

// GET /api/agents?agent=claude  → { thread, messages }
// GET /api/agents?all=1         → AgentMessage[] merged across all threads
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const agent = u.searchParams.get("agent");
  const all   = u.searchParams.get("all");

  if (all) {
    const { data } = await sbFetch(env, "agents_messages?order=created_at.asc&limit=200");
    return json(data || []);
  }

  if (!agent || !AGENTS[agent]) return json({ error: "agent required" }, 400);
  const thread = await getOrCreateThread(env, agent);
  const { data: messages } = await sbFetch(env, `agents_messages?thread_id=eq.${thread.id}&order=created_at.asc&limit=200`);
  return json({ thread, messages: messages || [] });
}

// POST /api/agents { agent, message, thread_id? } → { thread_id, user_message, reply }
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { agent, message, thread_id } = body;
  if (!agent || !AGENTS[agent]) return json({ error: "unknown agent" }, 400);
  if (!message?.trim()) return json({ error: "message required" }, 400);
  if (thread_id !== undefined && !isValidUUID(thread_id)) return json({ error: "invalid thread_id" }, 400);

  let threadId = thread_id;
  if (!threadId) {
    const thread = await getOrCreateThread(env, agent);
    threadId = thread.id;
  }

  const { data: history } = await sbFetch(env, `agents_messages?thread_id=eq.${threadId}&order=created_at.desc&limit=${MAX_HISTORY}`);
  const pastMessages = (history || []).reverse().map((m) => ({ role: m.role, content: m.content }));

  const { data: userMsgArr } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, agent, role: "user", content: message.trim() }),
    headers: { Prefer: "return=representation" },
  });
  const userMsg = Array.isArray(userMsgArr) ? userMsgArr[0] : userMsgArr;

  let reply;
  try {
    const conversationMessages = [...pastMessages, { role: "user", content: message.trim() }];
    reply = AGENTS[agent].provider === "anthropic"
      ? await callAnthropic(env, agent, conversationMessages)
      : await callOpenAI(env, agent, conversationMessages);
  } catch (e) {
    return json({ error: e.message }, 502);
  }

  const { data: replyMsgArr } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, agent, role: "assistant", content: reply }),
    headers: { Prefer: "return=representation" },
  });
  const replyMsg = Array.isArray(replyMsgArr) ? replyMsgArr[0] : replyMsgArr;

  return json({ thread_id: threadId, user_message: userMsg, reply: replyMsg });
}

// DELETE /api/agents?thread_id=uuid  → clears messages for that thread
export async function onRequestDelete({ request, env }) {
  const u = new URL(request.url);
  const threadId = u.searchParams.get("thread_id");
  if (!isValidUUID(threadId)) return json({ error: "valid thread_id required" }, 400);
  await sbFetch(env, `agents_messages?thread_id=eq.${threadId}`, { method: "DELETE" });
  return json({ ok: true });
}
