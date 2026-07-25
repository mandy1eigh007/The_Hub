import { json } from "../_lib.js";

// GET /api/notion?q=search_query  - search Notion
// GET /api/notion?id=page_id      - fetch a single page (first 3 blocks)

const NOTION_VERSION = "2022-06-28";

function notionHeaders(env) {
  return {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function extractTitle(page) {
  const props = page.properties || {};
  for (const key of ["Name", "Title", "title"]) {
    const p = props[key];
    if (p?.title) {
      return p.title.map((t) => t.plain_text).join("") || "Untitled";
    }
  }
  return "Untitled";
}

function extractSnippet(blocks) {
  const lines = [];
  for (const b of blocks.slice(0, 8)) {
    const rich = b[b.type]?.rich_text;
    if (rich) {
      const text = rich.map((r) => r.plain_text).join("").trim();
      if (text) lines.push(text);
    }
    if (lines.join(" ").length > 300) break;
  }
  return lines.join(" ").slice(0, 300);
}

export async function onRequestGet({ request, env }) {
  if (!env.NOTION_API_KEY) {
    return json({ error: "NOTION_API_KEY not configured" }, 500);
  }

  const u = new URL(request.url);
  const q  = u.searchParams.get("q");
  const id = u.searchParams.get("id");

  if (id) {
    // Fetch single page + first blocks
    const [pageRes, blocksRes] = await Promise.all([
      fetch(`https://api.notion.com/v1/pages/${id}`, { headers: notionHeaders(env) }),
      fetch(`https://api.notion.com/v1/blocks/${id}/children?page_size=20`, { headers: notionHeaders(env) }),
    ]);

    if (!pageRes.ok) return json({ error: "Page not found" }, 404);

    const page   = await pageRes.json();
    const blocks = await blocksRes.json();

    return json({
      id:      page.id,
      title:   extractTitle(page),
      url:     page.url,
      snippet: extractSnippet(blocks.results || []),
      blocks:  blocks.results?.slice(0, 20) || [],
    }, 200);
  }

  if (!q || !q.trim()) {
    return json({ error: "q or id required" }, 400);
  }

  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(env),
    body: JSON.stringify({
      query:  q.trim(),
      filter: { value: "page", property: "object" },
      sort:   { direction: "descending", timestamp: "last_edited_time" },
      page_size: 20,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return json({ error: "Notion search failed", detail: err.slice(0, 200) }, 502);
  }

  const data = await res.json();
  const results = (data.results || []).map((page) => ({
    id:       page.id,
    title:    extractTitle(page),
    url:      page.url,
    edited:   page.last_edited_time,
  }));

  return json({ query: q, results }, 200);
}
