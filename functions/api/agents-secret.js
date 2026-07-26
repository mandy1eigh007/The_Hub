// Dedicated endpoint for the Secret Slot.
// Invariants enforced here:
//   1. Secret is never written to Supabase.
//   2. Secret is never forwarded to any LLM.
//   3. Only server-allowlisted tools at hardcoded destinations may receive the secret.
//   4. Client receives only the filtered tool result, never the secret echoed back.

import { json, sbFetch } from "../_lib.js";

const AGENTS = {
  claude:  { provider: "anthropic", model: "claude-sonnet-4-6" },
  fable:   { provider: "anthropic", model: "claude-fable-5" },
  codex:   { provider: "openai",    model: "o4-mini",  reasoning: true },
  chatgpt: { provider: "openai",    model: "gpt-4.1" },
};

const MAX_HISTORY = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Allowlist: hardcoded destinations and filtered return shapes.
// Add tools here to expand what the secret slot can do.
// Never add generic proxy, arbitrary URL, or model-selected destination.
const ALLOWED_TOOLS = {
  "github-whoami": async (secret) => {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${secret}`,
        "User-Agent": "the-hub/1.0",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return { valid: false, status: res.status };
    const d = await res.json();
    return { valid: true, login: d.login, name: d.name, public_repos: d.public_repos };
  },
  "github-repos": async (secret) => {
    const res = await fetch("https://api.github.com/user/repos?per_page=30&sort=updated", {
      headers: {
        Authorization: `Bearer ${secret}`,
        "User-Agent": "the-hub/1.0",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return { valid: false, status: res.status };
    const data = await res.json();
    return {
      valid: true,
      repos: data.map((r) => ({ name: r.full_name, private: r.private, pushed_at: r.pushed_at })),
    };
  },
};

function systemPrompt(agent) {
  const names = { claude: "Claude", fable: "Fable", codex: "Codex", chatgpt: "ChatGPT" };
  return `You are ${names[agent]}, one of four AI agents in The Hub. Be direct, concise, and helpful.`;
}

async function callAnthropic(env, agent, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: AGENTS[agent].model, max_tokens: 2048, system: systemPrompt(agent), messages }),
  });
  if (!res.ok) throw new Error("Anthropic error");
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(env, agent, messages) {
  const config = AGENTS[agent];
  const body = {
    model: config.model,
    messages: [{ role: "system", content: systemPrompt(agent) }, ...messages],
    ...(config.reasoning ? { max_completion_tokens: 2048 } : { max_tokens: 2048 }),
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("OpenAI error");
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

// POST /api/agents-secret { agent, message, secret, tool, thread_id? }
export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { agent, message, secret, tool, thread_id } = body;
  if (!agent || !AGENTS[agent]) return json({ error: "unknown agent" }, 400);
  if (!secret?.trim()) return json({ error: "secret required" }, 400);
  if (!tool || !ALLOWED_TOOLS[tool]) return json({ error: "tool not in allowlist" }, 400);
  if (thread_id !== undefined && !UUID_RE.test(thread_id)) return json({ error: "invalid thread_id" }, 400);

  // Run the allowlisted tool — secret used here only, never leaves this block
  let toolResult;
  try {
    toolResult = await ALLOWED_TOOLS[tool](secret.trim());
  } catch {
    return json({ error: "Tool execution failed" }, 502);
  }

  // Resolve and verify thread ownership
  let threadId;
  if (thread_id) {
    const { data: owned } = await sbFetch(env, `agents_threads?id=eq.${thread_id}&agent=eq.${agent}&limit=1`);
    if (!owned?.length) return json({ error: "thread not found" }, 404);
    threadId = thread_id;
  } else {
    const thread = await getOrCreateThread(env, agent);
    threadId = thread.id;
  }

  // Fetch history
  const { data: history } = await sbFetch(env, `agents_messages?thread_id=eq.${threadId}&order=created_at.desc&limit=${MAX_HISTORY}`);
  const pastMessages = (history || []).reverse().map((m) => ({ role: m.role, content: m.content }));

  // What gets stored: the user's display message only (no secret, no raw result)
  const displayMessage = message?.trim() || `[used ${tool}]`;

  // What the LLM sees: display message + tool result (no secret at all)
  const toolResultText = JSON.stringify(toolResult, null, 2);
  const augmented = message?.trim()
    ? `${message.trim()}\n\n[${tool} result]:\n${toolResultText}`
    : `[${tool} result]:\n${toolResultText}`;

  const { data: userMsgArr } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, agent, role: "user", content: displayMessage }),
    headers: { Prefer: "return=representation" },
  });
  const userMsg = Array.isArray(userMsgArr) ? userMsgArr[0] : userMsgArr;

  let reply;
  try {
    const conversationMessages = [...pastMessages, { role: "user", content: augmented }];
    reply = AGENTS[agent].provider === "anthropic"
      ? await callAnthropic(env, agent, conversationMessages)
      : await callOpenAI(env, agent, conversationMessages);
  } catch {
    await sbFetch(env, `agents_messages?id=eq.${userMsg.id}`, { method: "DELETE" });
    return json({ error: "AI provider unavailable — try again." }, 502);
  }

  const { data: replyMsgArr } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, agent, role: "assistant", content: reply }),
    headers: { Prefer: "return=representation" },
  });
  const replyMsg = Array.isArray(replyMsgArr) ? replyMsgArr[0] : replyMsgArr;

  return json({ thread_id: threadId, user_message: userMsg, reply: replyMsg });
}
