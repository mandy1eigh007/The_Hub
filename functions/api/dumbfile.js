import { json, sbFetch } from "../_lib.js";

// POST /api/dumbfile   - generate an HTML dumb file via GPT-4o
// GET  /api/dumbfile   - list saved dumb files
// GET  /api/dumbfile?id=uuid - get a specific dumb file's HTML

export async function onRequestGet({ request, env }) {
  const u  = new URL(request.url);
  const id = u.searchParams.get("id");

  if (id) {
    const { status, data } = await sbFetch(env, `dumb_files?id=eq.${id}&select=id,title,html,context,created_at&limit=1`);
    const file = Array.isArray(data) ? data[0] : null;
    if (!file) return json({ error: "Not found" }, 404);
    return json(file, status);
  }

  const { status, data } = await sbFetch(env, "dumb_files?select=id,title,context,created_at&order=created_at.desc&limit=20");
  return json(data, status);
}

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return json({ error: "OPENAI_API_KEY not configured" }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { context = "hub-current-state", title } = body;

  // Gather live data to give GPT context
  const [sessionsRes, decisionsRes, loopsRes, impRes, tasksRes] = await Promise.all([
    sbFetch(env, "sessions?select=id,agent,started_at,projects(name,slug)&order=started_at.desc&limit=5"),
    sbFetch(env, "decisions?select=content,ts,accepted&order=ts.desc&limit=5"),
    sbFetch(env, "open_loops?select=content,resolved&resolved=eq.false&limit=10"),
    sbFetch(env, "imp_files?select=path,content&order=path.asc"),
    sbFetch(env, "hub_tasks?select=title,status,priority,project&status=neq.done&order=created_at.desc&limit=20"),
  ]);

  const appContext = JSON.stringify({
    recent_sessions: sessionsRes.data?.slice(0, 5) || [],
    decisions:       decisionsRes.data || [],
    open_loops:      loopsRes.data || [],
    imp:             impRes.data || [],
    open_tasks:      tasksRes.data || [],
  });

  const systemPrompt = `You are a visual explainer for a developer with ADHD and time blindness who learns visually.
Generate a SELF-CONTAINED HTML file that visually explains the current state of The Hub app.

STYLE RULES (follow exactly):
- Use Google Fonts: Barlow Condensed (headers) + Inter (body) + DM Mono (code/data)
- Dark background: #0f1117, cards: #1a1f2e, borders: #2a2f3e
- Color system: green=#22c55e (done/active), yellow=#f59e0b (warning/doing), red=#ef4444 (blocked), blue=#38bdf8 (info), purple=#a78bfa (special)
- BIG readable text — minimum 14px body, 24px+ headers
- Card-based sections — no walls of text
- Visual flow diagrams using ASCII or CSS boxes with arrows
- Status badges with color fills
- Each section has ONE clear takeaway at the top in large text
- Include: current open tasks, recent sessions, open loops, what bridge.py does (visual), how to use each page
- Add a "WHAT TO DO FIRST" section at the top in giant text
- Self-contained: all CSS inline, no external dependencies except Google Fonts

Return ONLY the complete HTML document, nothing else.`;

  const oaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system",  content: systemPrompt },
        { role: "user",    content: `Generate the dumb file for The Hub.\n\nCurrent app data:\n${appContext}\n\nTitle: ${title || "The Hub — Current State"}` },
      ],
      max_tokens: 4000,
    }),
  });

  if (!oaiRes.ok) {
    const err = await oaiRes.text();
    return json({ error: "OpenAI error", detail: err.slice(0, 300) }, 502);
  }

  const oaiData = await oaiRes.json();
  let html      = oaiData.choices?.[0]?.message?.content || "";
  // Strip markdown code fences GPT-4o sometimes wraps around the HTML
  html = html.replace(/^```(?:html)?\r?\n?/, "").replace(/\r?\n?```$/, "").trim();

  // Save to Supabase
  const fileTitle = title || `Hub State — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const { data: saved } = await sbFetch(env, "dumb_files", {
    method: "POST",
    body:   JSON.stringify({ title: fileTitle, html, context }),
    headers: { Prefer: "return=representation" },
  });
  const savedFile = Array.isArray(saved) ? saved[0] : saved;

  return json({ id: savedFile?.id, title: fileTitle, html }, 200);
}
