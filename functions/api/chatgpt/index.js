import { json, sbFetch } from "../../_lib.js";

// GET  /api/chatgpt           - list recent threads (newest first)
// POST /api/chatgpt           - send a message; creates thread if thread_id omitted
//   body: { message, thread_id?, title?, model? }
//   returns: { thread_id, reply, thread_title }

const DEFAULT_MODEL = "gpt-4o";

async function loadHistory(env, threadId) {
  const p = new URLSearchParams();
  p.set("select", "role,content");
  p.set("thread_id", `eq.${threadId}`);
  p.set("order", "ts.asc");
  p.set("limit", "40");
  const { data } = await sbFetch(env, `chatgpt_messages?${p.toString()}`);
  return Array.isArray(data) ? data : [];
}

export async function onRequestGet({ env }) {
  const p = new URLSearchParams();
  p.set("select", "id,title,session_id,created_at");
  p.set("order", "created_at.desc");
  p.set("limit", "50");
  const { status, data } = await sbFetch(env, `chatgpt_threads?${p.toString()}`);
  return json(data, status);
}

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY not configured in Cloudflare secrets" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { message, thread_id, title, model = DEFAULT_MODEL, session_id } = body;
  if (!message || !message.trim()) {
    return json({ error: "message required" }, 400);
  }

  // Resolve or create thread
  let tid = thread_id;
  let threadTitle = title;

  if (!tid) {
    // Create new thread
    const row = {
      title:      threadTitle || message.slice(0, 60),
      session_id: session_id || null,
    };
    const { data: tdata } = await sbFetch(env, "chatgpt_threads", {
      method: "POST",
      body:   JSON.stringify(row),
      headers: { Prefer: "return=representation" },
    });
    const thread = Array.isArray(tdata) ? tdata[0] : tdata;
    if (!thread?.id) return json({ error: "Failed to create thread" }, 500);
    tid = thread.id;
    threadTitle = thread.title;
  }

  // Load history
  const history = await loadHistory(env, tid);

  // Build OpenAI messages array
  const messages = [
    { role: "system", content: "You are ChatGPT, a collaborator in The Hub command center for Mandy's dev projects. Be concise and direct." },
    ...history,
    { role: "user", content: message.trim() },
  ];

  // Call OpenAI
  const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 1500 }),
  });

  if (!oaiRes.ok) {
    const err = await oaiRes.text();
    return json({ error: "OpenAI error", detail: err.slice(0, 300) }, 502);
  }

  const oaiData = await oaiRes.json();
  const reply = oaiData.choices?.[0]?.message?.content || "";

  // Save both messages
  const now = new Date().toISOString();
  await sbFetch(env, "chatgpt_messages", {
    method: "POST",
    body: JSON.stringify([
      { thread_id: tid, role: "user",      content: message.trim(), model, ts: now },
      { thread_id: tid, role: "assistant", content: reply,          model, ts: new Date(Date.now() + 1).toISOString() },
    ]),
  });

  return json({ thread_id: tid, thread_title: threadTitle, reply }, 200);
}
