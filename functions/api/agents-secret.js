// Dedicated endpoint for the Secret Slot.
// Invariants enforced here:
//   1. Secret is never written to Supabase.
//   2. Secret is never forwarded to any LLM.
//   3. Only server-allowlisted tools at hardcoded destinations may receive the secret.
//   4. Thread is resolved and verified BEFORE the tool runs.
//   5. Provider is called AFTER thread/input validation and BEFORE DB inserts.
//   6. Client receives only the filtered tool result, never the secret echoed back.

import { json, sbFetch } from "../_lib.js";

const MAX_BODY_BYTES = 512 * 1024;
const PROVIDER_TIMEOUT_MS = 30_000;
const TOOL_TIMEOUT_MS = 10_000;

const AGENTS = {
  claude:  { provider: "anthropic", model: "claude-sonnet-4-6" },
  fable:   { provider: "anthropic", model: "claude-fable-5" },
  codex:   { provider: "openai",    model: "gpt-5-mini" },
  chatgpt: { provider: "openai",    model: "gpt-4.1" },
};

// Allowlist: hardcoded destinations and filtered return shapes.
// Add tools here to expand what the secret slot can do.
// Never add generic proxy, arbitrary URL, or model-selected destination.
const ALLOWED_TOOLS = {
  "github-whoami": async (secret) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
    try {
      const res = await fetch("https://api.github.com/user", {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${secret}`,
          "User-Agent": "the-hub/1.0",
          Accept: "application/vnd.github+json",
        },
      });
      if (!res.ok) return { valid: false, status: res.status };
      const d = await res.json();
      return { valid: true, login: d.login, name: d.name, public_repos: d.public_repos };
    } finally {
      clearTimeout(timer);
    }
  },
  "github-repos": async (secret) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOOL_TIMEOUT_MS);
    try {
      const res = await fetch("https://api.github.com/user/repos?per_page=30&sort=updated", {
        signal: controller.signal,
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
    } finally {
      clearTimeout(timer);
    }
  },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validAgent(agent) {
  return typeof agent === "string" && Object.prototype.hasOwnProperty.call(AGENTS, agent);
}

function validTool(tool) {
  return typeof tool === "string" && Object.prototype.hasOwnProperty.call(ALLOWED_TOOLS, tool);
}

function systemPrompt(agent) {
  const names = { claude: "Claude", fable: "Fable", codex: "Codex", chatgpt: "ChatGPT" };
  return `You are ${names[agent]}, one of four AI agents in The Hub. Be direct, concise, and helpful.`;
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
      body: JSON.stringify({ model: AGENTS[agent].model, max_tokens: 2048, system: systemPrompt(agent), messages }),
    });
    if (!res.ok) throw new Error("Anthropic error");
    const data = await res.json();
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
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("OpenAI error");
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return "[This request was declined.]";
    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function getOrCreateThread(env, agent) {
  const { data, ok } = await sbFetch(env, "agents_threads", {
    method: "POST",
    body: JSON.stringify({ agent }),
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
  });
  if (ok && Array.isArray(data) && data.length) return data[0];
  const { data: existing, ok: getOk } = await sbFetch(env, `agents_threads?agent=eq.${encodeURIComponent(agent)}&limit=1`);
  if (getOk && existing?.length) return existing[0];
  throw new Error("Thread unavailable");
}

// POST /api/agents-secret { agent, message, secret, tool, thread_id? }
export async function onRequestPost({ request, env }) {
  // Fast reject if header present; real guard is the post-read check below
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);

  let rawBody;
  try { rawBody = await request.text(); } catch { return json({ error: "Failed to read body" }, 400); }
  if (rawBody.length > MAX_BODY_BYTES) return json({ error: "Request too large" }, 413);
  let body;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { agent, message, secret, tool, thread_id } = body;

  // Validate all inputs before any side effects — type + length checks defend against prototype tricks
  if (!validAgent(agent)) return json({ error: "unknown agent" }, 400);
  if (typeof secret !== "string" || !secret.trim() || secret.length > 8000) return json({ error: "secret required (1–8000 chars)" }, 400);
  if (!validTool(tool)) return json({ error: "tool not in allowlist" }, 400);
  if (message !== undefined && (typeof message !== "string" || message.length > 4000)) return json({ error: "message too long" }, 400);
  if (thread_id !== undefined && !UUID_RE.test(thread_id)) return json({ error: "invalid thread_id" }, 400);

  // Resolve and verify thread BEFORE running tool (prevents wasted outbound calls on bad input)
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
  const { data: history, ok: histOk } = await sbFetch(env, `agents_messages?thread_id=eq.${threadId}&order=created_at.desc&limit=20`);
  if (!histOk) return json({ error: "Failed to load history" }, 502);
  const pastMessages = (history || []).reverse().map((m) => ({ role: m.role, content: m.content }));

  // Run the allowlisted tool — secret used here only, reference ends after this block
  let toolResult;
  try {
    toolResult = await ALLOWED_TOOLS[tool](secret.trim());
  } catch {
    return json({ error: "Tool execution failed" }, 502);
  }

  // What gets stored: user's display message only (no secret, no raw result)
  const displayMessage = message?.trim() || `[used ${tool}]`;

  // What the LLM sees: display message + tool result (no secret)
  const toolResultText = JSON.stringify(toolResult, null, 2);
  const augmented = message?.trim()
    ? `${message.trim()}\n\n[${tool} result]:\n${toolResultText}`
    : `[${tool} result]:\n${toolResultText}`;

  // Call provider BEFORE DB inserts — prevents ghost messages on failure
  let replyText;
  try {
    const conversationMessages = [...pastMessages, { role: "user", content: augmented }];
    replyText = AGENTS[agent].provider === "anthropic"
      ? await callAnthropic(env, agent, conversationMessages)
      : await callOpenAI(env, agent, conversationMessages);
  } catch {
    return json({ error: "AI provider unavailable — try again." }, 502);
  }

  // Single array insert — PostgREST processes both rows atomically (secret never stored)
  const { data: inserted, ok: insertOk } = await sbFetch(env, "agents_messages", {
    method: "POST",
    body: JSON.stringify([
      { thread_id: threadId, agent, role: "user",      content: displayMessage },
      { thread_id: threadId, agent, role: "assistant", content: replyText },
    ]),
    headers: { Prefer: "return=representation" },
  });
  if (!insertOk || !Array.isArray(inserted) || inserted.length !== 2) {
    return json({ error: "Failed to save conversation" }, 502);
  }
  const userMsg  = inserted.find((m) => m.role === "user");
  const replyMsg = inserted.find((m) => m.role === "assistant");

  return json({ thread_id: threadId, user_message: userMsg, reply: replyMsg });
}
