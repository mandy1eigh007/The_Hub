import { json } from "../_lib.js";

// GET /api/github?type=prs   - open PRs across all repos
// GET /api/github?type=commits&repo=owner/name  - recent commits for a repo
// GET /api/github?type=repos - list recent repos

const GH_API = "https://api.github.com";
const GH_USER = "mandy1eigh007";

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghGet(env, path) {
  const res = await fetch(`${GH_API}${path}`, { headers: ghHeaders(env) });
  if (!res.ok) {
    const err = await res.text();
    return { error: true, status: res.status, detail: err.slice(0, 200) };
  }
  return res.json();
}

export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_TOKEN) {
    return json({ error: "GITHUB_TOKEN not configured" }, 500);
  }

  const u    = new URL(request.url);
  const type = u.searchParams.get("type") || "prs";
  const repo = u.searchParams.get("repo");

  if (type === "repos") {
    const data = await ghGet(env, `/users/${GH_USER}/repos?sort=pushed&per_page=30`);
    if (data.error) return json(data, data.status || 502);
    const repos = data.map((r) => ({
      full_name:    r.full_name,
      description:  r.description,
      pushed_at:    r.pushed_at,
      open_issues:  r.open_issues_count,
      default_branch: r.default_branch,
      html_url:     r.html_url,
    }));
    return json(repos, 200);
  }

  if (type === "commits") {
    if (!repo) return json({ error: "repo required for commits" }, 400);
    const data = await ghGet(env, `/repos/${repo}/commits?per_page=20`);
    if (data.error) return json(data, data.status || 502);
    const commits = data.map((c) => ({
      sha:     c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0].slice(0, 100),
      author:  c.commit.author.name,
      date:    c.commit.author.date,
      url:     c.html_url,
    }));
    return json(commits, 200);
  }

  if (type === "prs") {
    // Pull open PRs from the user's repos — search API is the easiest way
    const query  = `is:pr is:open author:${GH_USER}`;
    const data   = await ghGet(env, `/search/issues?q=${encodeURIComponent(query)}&per_page=30&sort=updated`);
    if (data.error) return json(data, data.status || 502);
    const prs = (data.items || []).map((item) => ({
      id:         item.number,
      title:      item.title,
      repo:       item.repository_url?.split("/repos/")[1] || "",
      state:      item.state,
      updated_at: item.updated_at,
      url:        item.html_url,
      labels:     item.labels?.map((l) => l.name) || [],
    }));
    return json(prs, 200);
  }

  return json({ error: "type must be prs, commits, or repos" }, 400);
}
