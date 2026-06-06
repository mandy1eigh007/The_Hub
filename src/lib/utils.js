// ── String escaping ───────────────────────────────────────────────────────────
export const esc     = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const htmlEsc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function sanitizeFilename(s) {
  return (s || 'chat').replace(/[^a-z0-9\s\-_]/gi, '').replace(/\s+/g, '-').toLowerCase().slice(0, 60) || 'chat';
}

// ── Session → Markdown ────────────────────────────────────────────────────────
export function buildSessionMd(s) {
  const dt = new Date(s.date).toISOString().split('T')[0];
  let md = `---\ntitle: "${(s.title || 'Chat').replace(/"/g, "'")}"\ndate: ${dt}\nmode: ${s.mode}\nsource: hub\ntags: [${s.mode}, hub, conversation]\n---\n\n# ${s.title || 'Chat'}\n\n`;
  for (const m of s.messages) {
    if (m.role === 'user')        md += `**You:** ${m.content || ''}\n\n`;
    else if (m.source === 'both') md += `**Claude:** ${m.claude || ''}\n\n**ChatGPT:** ${m.gpt || ''}\n\n`;
    else                          md += `**${m.source === 'gpt' ? 'ChatGPT' : 'Claude'}:** ${m.content || ''}\n\n`;
  }
  return md;
}

// ── Build message array for AI API calls ──────────────────────────────────────
// imgRegistry maps id → dataUrl (memory-only, not persisted).
// Pass it in so vision messages can include base64 image blocks.
// Historical messages loaded from localStorage won't have registry entries —
// their images show in the UI (via stored imgIds) but aren't resent to the API.
export function buildApiMessages(msgs, imgRegistry = {}) {
  const result = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      const imgIds = m.imgIds || [];
      const imgBlocks = imgIds
        .map(i => imgRegistry[i.id])
        .filter(Boolean)
        .map(dataUrl => {
          // dataUrl format: "data:image/png;base64,XXXX"
          const [header, data] = dataUrl.split(',');
          const mimeType = header.replace('data:', '').replace(';base64', '');
          // Claude format: { type:'image', source:{ type:'base64', media_type, data } }
          // GPT format:    { type:'image_url', image_url:{ url: dataUrl } }
          // We send Claude format — server route converts for GPT
          return { type: 'image', source: { type: 'base64', media_type: mimeType, data } };
        });

      if (imgBlocks.length > 0) {
        // Multi-modal content array
        const content = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        content.push(...imgBlocks);
        result.push({ role: 'user', content });
      } else {
        result.push({ role: 'user', content: m.content || '' });
      }
    } else {
      result.push({ role: 'assistant', content: m.claude || m.gpt || m.content || '' });
    }
  }
  return result.slice(-30);
}

// ── Markdown renderer ─────────────────────────────────────────────────────────
// Extract → protect → escape → transform → restore pipeline.
// Code blocks, inline code, and tables are extracted before escaping
// to prevent their HTML output from being double-escaped.
export function renderMd(raw) {
  if (!raw) return '';
  const saved = [];
  const save    = html => { const i = saved.length; saved.push(html); return `\x00${i}\x00`; };
  const restore = s    => s.replace(/\x00(\d+)\x00/g, (_, i) => saved[+i]);

  let s = raw;
  // 1. Fenced code blocks
  s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    save(`<pre><code>${htmlEsc(code.trimEnd())}</code></pre>`));
  // 2. Inline code
  s = s.replace(/`([^`\n]+)`/g, (_, c) => save(`<code>${htmlEsc(c)}</code>`));
  // 3. Tables
  s = s.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm, (_, hdr, rows) => {
    const th  = hdr.split('|').filter(c => c.trim()).map(c => `<th>${htmlEsc(c.trim())}</th>`).join('');
    const trs = rows.trim().split('\n').map(r =>
      `<tr>${r.split('|').filter(c => c.trim()).map(c => `<td>${htmlEsc(c.trim())}</td>`).join('')}</tr>`
    ).join('');
    return save(`<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
  });
  // 4. Escape remaining plain text
  s = htmlEsc(s);
  // 5. Restore saved HTML fragments
  s = restore(s);
  // 6. Block-level markdown transforms
  s = s.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  s = s.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  s = s.replace(/^# (.+)$/gm,   '<h1>$1</h1>');
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*(.+?)\*\*/g,     '<strong>$1</strong>');
  s = s.replace(/\*([^\s*][^*]*)\*/g, '<em>$1</em>');
  s = s.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  s = s.replace(/^(---|\*\*\*|___)\s*$/gm, '<hr>');
  s = s.replace(/((?:^[-*+] .+\n?)+)/gm, m =>
    `<ul>${m.trim().split('\n').map(l => `<li>${l.replace(/^[-*+] /, '')}</li>`).join('')}</ul>`);
  s = s.replace(/((?:^\d+\. .+\n?)+)/gm, m =>
    `<ol>${m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('')}</ol>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // 7. Wrap text blocks in paragraphs
  s = s.split(/\n\n+/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^<(h[1-6]|ul|ol|table|blockquote|hr|pre|\x00)/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  // 8. Final restore + unwrap pre from p
  s = restore(s);
  s = s.replace(/<p>(<pre>[\s\S]*?<\/pre>)<\/p>/g, '$1');
  return s;
}
