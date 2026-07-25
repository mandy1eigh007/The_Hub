import { json, sbFetch } from "../../_lib.js";

// GET /api/chatgpt/:thread - full thread with all messages

export async function onRequestGet({ params, env }) {
  const tid = decodeURIComponent(params.thread);

  const [threadRes, msgRes] = await Promise.all([
    sbFetch(env, `chatgpt_threads?id=eq.${tid}&select=id,title,session_id,created_at&limit=1`),
    sbFetch(env, `chatgpt_messages?thread_id=eq.${tid}&select=id,role,content,model,ts&order=ts.asc`),
  ]);

  const thread = Array.isArray(threadRes.data) ? threadRes.data[0] : null;
  if (!thread) return json({ error: "Thread not found" }, 404);

  return json({ thread, messages: msgRes.data || [] }, 200);
}
