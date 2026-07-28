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

  const systemPrompt = `You create Dumb Files: tiny, calm visual SOPs that help Mandy re-learn what her own apps do without rereading a chat or feeling lost.

PURPOSE (non-negotiable):
- Explain one named workflow, app, or system at a time. Do not turn this into a generic dashboard report or a dump of every available fact.
- Answer visually: What is this? What happens in order? What does Mandy need to know or do? What can she safely ignore?
- Use only facts supported by the supplied context. Never invent a status, workflow, feature, credential, person, or policy.

VISUAL SOP LAYOUT (follow exactly):
1. A compact, calm header: direct title, one plain-English sentence, and one short takeaway.
2. A Mermaid flow diagram near the top showing the workflow. Put Mermaid source only inside <pre class="mermaid">...</pre>. Use a simple flowchart with 3–7 nodes; label every node in plain English.
3. A card grid that explains each important step in one or two short sentences.
4. When explaining an app map, use compact CSS screen mockups inside page cards so Mandy can recognize where she is. Do not use decorative icons or emoji.
5. A small "What this means for Mandy" section and, when applicable, a short "Next time" checklist.
6. A short rules/guardrails section only when the workflow has real rules. Never pad the document with boilerplate.

CALM DEVILISH VISUAL LANGUAGE:
- Dark, low-glare palette only: background #0d1117; cards #161b22; raised areas #21262d; borders #30363d; main text #e6edf3; muted text #8b949e.
- Use restrained accents only to distinguish meaning: blue #58a6ff, green #3fb950, orange #f0883e, purple #bc8cff, red #f85149. Never use bright purple blocks, neon gradients, or large glowing color fields.
- Wide readable page (max-width about 1320px), compact header, generous section separation, thin borders, rounded cards, and responsive grids.
- Minimum 12px body text, 16px section titles, 26px page title. Keep paragraphs short and cards scannable.
- Inline CSS only. Do not include scripts, iframes, external assets, or Mermaid imports. The Hub viewer safely renders Mermaid blocks before showing the sandboxed file.

SAFETY:
- Never include API keys, tokens, passwords, private records, or raw local paths.
- Never claim a diagram is live data. Date or qualify anything that is only a current snapshot.

Return ONLY a complete HTML document, nothing else.`;

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
