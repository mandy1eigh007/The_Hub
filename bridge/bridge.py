"""
bridge.py - Hub local bridge daemon.

Syncs local files to Supabase so the Hub web app can read them:
  ROOM.jsonl        -> room_messages table
  WIRE.jsonl        -> wire_messages table
  NOW/TODO/STATE.md -> imp_files table
  active Claude/Codex feeds -> live_tail table
  Obsidian vault    -> obsidian_notes table (requires --with-obsidian)

Also syncs Hub-posted room_messages back to ROOM.jsonl so room.ps1 sees them.

Requires:
  - HUB_SERVICE_KEY in Windows user environment
  - SUPABASE_URL in Windows user environment (or hardcoded below)
  - pip install requests

Run:
  python bridge.py                    # continuous loop: room, wire, tail, imp only
  python bridge.py --with-obsidian    # also sync Obsidian (requires OBSIDIAN_VAULT_PATH)
  python bridge.py --once             # single pass and exit
  python bridge.py --source room      # only sync room
"""

import os, sys, json, time, hashlib, argparse, logging
from datetime import datetime, timezone
from pathlib import Path

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s bridge %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("bridge")

# ── config ───────────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "https://tzvutctcvnqzqjaxfktz.supabase.co",
)
SERVICE_KEY = os.environ.get("HUB_SERVICE_KEY", "")

ROOM_JSONL   = Path(r"C:\imp\room\ROOM.jsonl")
WIRE_JSONL   = Path(r"C:\imp\room\WIRE.jsonl")
IMP_DOCS     = [
    Path(r"C:\imp\NOW.md"),
    Path(r"C:\imp\TODO.md"),
    Path(r"C:\imp\STATE.md"),
]
CLAUDE_PROJECTS = Path(r"C:\Users\mandy\.claude\projects")
# Written by the approved Codex lifecycle hooks. Keep this outside IMP: live
# agent conversation data may be personal and must never become an IMP file.
CODEX_TAIL = Path(os.environ.get("CODEX_TAIL_PATH", r"C:\Users\mandy\.codex\hub-tail.jsonl"))
OBSIDIAN_VAULT  = Path(os.environ.get("OBSIDIAN_VAULT_PATH", "")) if os.environ.get("OBSIDIAN_VAULT_PATH") else None

# files that should never be synced to Obsidian notes table
OBSIDIAN_EXCLUDE_STEMS = {".obsidian", "AIEG-Private", "AIEG-Tools", "sealed"}
OBSIDIAN_MAX_SIZE = 100 * 1024  # skip notes larger than 100 KB

WATERMARK_FILE = Path(r"C:\imp\scripts\.bridge-watermarks.json")

# ── http helpers ─────────────────────────────────────────────────────────────

def headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def sb_post(table: str, rows: list, on_conflict: str | None = None) -> int:
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {}
    if on_conflict:
        params["on_conflict"] = on_conflict
    h = {**headers(), "Prefer": f"resolution=merge-duplicates,return=minimal"}
    r = requests.post(url, json=rows, headers=h, params=params, timeout=15)
    if r.status_code not in (200, 201, 204, 409):
        log.warning("POST %s -> %d: %s", table, r.status_code, r.text[:200])
        return 0
    return len(rows)


def sb_get(table: str, params: dict) -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.get(url, headers=headers(), params=params, timeout=15)
    if not r.ok:
        log.warning("GET %s -> %d", table, r.status_code)
        return []
    return r.json()


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


# ── watermarks ───────────────────────────────────────────────────────────────

def load_watermarks() -> dict:
    if WATERMARK_FILE.exists():
        try:
            return json.loads(WATERMARK_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_watermarks(wm: dict):
    WATERMARK_FILE.parent.mkdir(parents=True, exist_ok=True)
    WATERMARK_FILE.write_text(json.dumps(wm, indent=2), encoding="utf-8")


# ── ROOM.jsonl sync ──────────────────────────────────────────────────────────

def sync_room(wm: dict):
    if not ROOM_JSONL.exists():
        return
    lines = ROOM_JSONL.read_text(encoding="utf-8", errors="replace").splitlines()
    key = "room_line"
    start = wm.get(key, 0)
    new_lines = lines[start:]
    if not new_lines:
        return

    rows = []
    for i, line in enumerate(new_lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        source_key = f"room:{start + i}"
        ts_raw = entry.get("ts", "")
        rows.append({
            "speaker":    entry.get("speaker", "system").lower(),
            "content":    entry.get("text", ""),
            "ts":         ts_raw if ts_raw else None,
            "turn_id":    entry.get("turn_id"),
            "origin":     "room_file",
            "source_key": source_key,
        })

    pushed = sb_post("room_messages", rows, on_conflict="source_key")
    if pushed:
        wm[key] = start + len(new_lines)
        log.info("room: pushed %d new entries (total seen: %d)", pushed, wm[key])


def sync_hub_to_room_file(wm: dict):
    """Pull Hub-posted room_messages back to ROOM.jsonl so room.ps1 sees them."""
    rows = sb_get("room_messages", {
        "select": "id,speaker,content,ts,turn_id",
        "origin": "eq.hub",
        "hub_synced_at": "is.null",
        "order": "ts.asc",
        "limit": "50",
    })
    if not rows:
        return

    # Find current max turn_id in local file
    local_lines = []
    if ROOM_JSONL.exists():
        local_lines = [l for l in ROOM_JSONL.read_text(encoding="utf-8").splitlines() if l.strip()]

    max_turn = 0
    for l in local_lines:
        try:
            e = json.loads(l)
            t = e.get("turn_id", 0)
            if t and float(t) > max_turn:
                max_turn = float(t)
        except Exception:
            pass

    appended = []
    for row in rows:
        speaker = (row.get("speaker") or "mandy").capitalize()
        text    = row.get("content", "")
        ts_raw  = row.get("ts") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        turn_id = row.get("turn_id") or (max_turn + 1)
        entry   = json.dumps({
            "turn_id": turn_id,
            "ts":      ts_raw[:19] if ts_raw else "",
            "speaker": speaker,
            "status":  "open",
            "text":    text,
        }, ensure_ascii=False)
        appended.append(entry)

    if appended:
        ROOM_JSONL.parent.mkdir(parents=True, exist_ok=True)
        with ROOM_JSONL.open("a", encoding="utf-8") as f:
            for line in appended:
                f.write(line + "\n")

    # Mark synced in Supabase
    ids = [r["id"] for r in rows]
    now_iso = datetime.now(timezone.utc).isoformat()
    for rid in ids:
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/room_messages",
            json={"hub_synced_at": now_iso},
            headers={**headers(), "Prefer": "return=minimal"},
            params={"id": f"eq.{rid}"},
            timeout=10,
        )
    log.info("room: wrote %d Hub messages back to ROOM.jsonl", len(appended))


# ── WIRE.jsonl sync ──────────────────────────────────────────────────────────

def sync_wire(wm: dict):
    if not WIRE_JSONL.exists():
        return
    lines = WIRE_JSONL.read_text(encoding="utf-8", errors="replace").splitlines()
    key   = "wire_line"
    start = wm.get(key, 0)
    new_lines = lines[start:]
    if not new_lines:
        return

    rows = []
    for i, line in enumerate(new_lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if entry.get("hub_echo"):
            continue
        rows.append({
            "ts":       entry.get("ts"),
            "speaker":  entry.get("speaker", "system").lower(),
            "kind":     entry.get("kind"),
            "re":       entry.get("re"),
            "content":  entry.get("text", ""),
            "artifact": entry.get("artifact"),
            "line_idx": start + i,
        })

    if rows:
        pushed = sb_post("wire_messages", rows, on_conflict="line_idx")
        if pushed:
            wm[key] = start + len(new_lines)
            log.info("wire: pushed %d entries", pushed)
    else:
        # All new lines were hub_echo or blank — advance watermark without pushing
        wm[key] = start + len(new_lines)


def sync_hub_to_wire_file(wm: dict):
    """Pull Hub-posted wire_messages back to WIRE.jsonl so agents see them."""
    since = wm.get("wire_hub_reverse", "")
    params = {
        "select": "id,ts,speaker,kind,re,content,created_at",
        "speaker": "eq.hub",
        "order": "created_at.asc",
        "limit": "50",
    }
    if since:
        params["created_at"] = f"gt.{since}"
    rows = sb_get("wire_messages", params)
    if not rows:
        return
    WIRE_JSONL.parent.mkdir(parents=True, exist_ok=True)
    with WIRE_JSONL.open("a", encoding="utf-8") as f:
        for row in rows:
            entry = json.dumps({
                "ts":       row.get("ts") or row.get("created_at"),
                "speaker":  row.get("speaker", "hub").lower(),
                "kind":     row.get("kind"),
                "re":       row.get("re"),
                "text":     row.get("content", ""),
                "hub_echo": True,
            }, ensure_ascii=False)
            f.write(entry + "\n")
    # sync_wire() skips hub_echo lines, so no watermark adjustment needed here
    wm["wire_hub_reverse"] = rows[-1]["created_at"]
    log.info("wire: wrote %d Hub messages back to WIRE.jsonl", len(rows))


# ── IMP docs sync ────────────────────────────────────────────────────────────

def sync_imp(wm: dict):
    rows = []
    for path in IMP_DOCS:
        if not path.exists():
            continue
        content = path.read_text(encoding="utf-8", errors="replace")
        h = sha256(content)
        cache_key = f"imp:{path.name}"
        if wm.get(cache_key) == h:
            continue
        rows.append({
            "path":      path.name,
            "content":   content,
            "sha256":    h,
            "sensitivity": 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        wm[cache_key] = h

    pushed = sb_post("imp_files", rows, on_conflict="path")
    if pushed:
        log.info("imp: synced %d docs", pushed)


# ── live tail sync ───────────────────────────────────────────────────────────

def _extract_tail_content(entry: dict) -> tuple[str | None, str | None]:
    """Return (speaker, content) from a Claude Code .jsonl line."""
    etype = entry.get("type", "")
    msg   = entry.get("message", {})
    role  = msg.get("role", etype)

    content_raw = msg.get("content", "")
    if role == "assistant":
        speaker = "claude"
    elif role == "user":
        # Claude Code records tool results as role=user messages. They are not
        # Mandy's words, even though they travel on the user side of the trace.
        has_tool_result = isinstance(content_raw, list) and any(
            isinstance(block, dict) and block.get("type") == "tool_result"
            for block in content_raw
        )
        speaker = "tool" if has_tool_result else "mandy"
    else:
        speaker = "system"

    if isinstance(content_raw, str):
        text = content_raw.strip()
    elif isinstance(content_raw, list):
        parts = []
        for block in content_raw:
            if isinstance(block, dict):
                btype = block.get("type", "")
                if btype == "text":
                    parts.append(block.get("text", ""))
                elif btype == "tool_use":
                    parts.append(f"[tool: {block.get('name','')}]")
                elif btype == "tool_result":
                    inner = block.get("content", "")
                    if isinstance(inner, str):
                        parts.append(f"[result: {inner[:200]}]")
        text = " ".join(p for p in parts if p).strip()
    else:
        text = ""

    return (speaker, text) if text else (None, None)


def sync_tail(wm: dict):
    if not CLAUDE_PROJECTS.exists():
        return

    # Find most recently modified .jsonl across all project subdirs
    best_path = None
    best_mtime = 0
    for jf in CLAUDE_PROJECTS.rglob("*.jsonl"):
        try:
            mt = jf.stat().st_mtime
            if mt > best_mtime:
                best_mtime = mt
                best_path = jf
        except OSError:
            pass

    if not best_path:
        return

    path_key = str(best_path)
    lines = best_path.read_text(encoding="utf-8", errors="replace").splitlines()
    start = wm.get(f"tail:{path_key}", 0)
    new_lines = lines[start:]
    if not new_lines:
        return

    rows = []
    for i, line in enumerate(new_lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        speaker, content = _extract_tail_content(entry)
        if not content:
            continue
        rows.append({
            "session_path": path_key,
            "line_index":   start + i,
            "speaker":      speaker,
            "role":         entry.get("type", entry.get("message", {}).get("role")),
            "content":      content[:4000],
        })

    # Insert in batches of 100
    pushed = 0
    for i in range(0, len(rows), 100):
        pushed += sb_post("live_tail", rows[i:i+100], on_conflict="session_path,line_index")

    if pushed:
        wm[f"tail:{path_key}"] = start + len(new_lines)
        log.info("tail: pushed %d lines from %s", pushed, best_path.name)

    # Prune old rows for this session only; keep last 500 lines
    if start > 500:
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/live_tail",
            headers=headers(),
            params={
                "session_path": f"eq.{path_key}",
                "line_index":   f"lt.{max(0, start - 500)}",
            },
            timeout=10,
        )


def sync_codex_tail(wm: dict):
    """Sync the normalized local Codex hook feed into the shared tail table."""
    if not CODEX_TAIL.exists():
        return

    lines = CODEX_TAIL.read_text(encoding="utf-8", errors="replace").splitlines()
    key = "codex_tail_line"
    start = wm.get(key, 0)
    new_lines = lines[start:]
    if not new_lines:
        return

    rows = []
    for i, line in enumerate(new_lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        content = entry.get("content", "")
        if not isinstance(content, str) or not content.strip():
            continue
        speaker = (entry.get("speaker") or "system").lower()
        if speaker not in {"mandy", "codex", "system"}:
            speaker = "system"
        session_id = str(entry.get("session_id") or "unknown")
        rows.append({
            "session_path": f"codex:{session_id}",
            "line_index":   start + i,
            "speaker":      speaker,
            "role":         entry.get("role") or "message",
            "content":      content[:4000],
            "ts":           entry.get("ts") or None,
        })

    if rows:
        pushed = 0
        for i in range(0, len(rows), 100):
            pushed += sb_post("live_tail", rows[i:i + 100], on_conflict="session_path,line_index")
        if pushed:
            wm[key] = start + len(new_lines)
            log.info("tail: pushed %d Codex feed entries", pushed)
    else:
        # Invalid or blank records must not permanently stall the feed.
        wm[key] = start + len(new_lines)


# ── Obsidian sync ─────────────────────────────────────────────────────────────

def _obsidian_tags(content: str) -> list[str]:
    """Extract #tags from Obsidian markdown content."""
    import re
    return list(set(re.findall(r"(?<!\w)#([A-Za-z0-9_/-]+)", content)))


def sync_obsidian(wm: dict):
    if not OBSIDIAN_VAULT or not OBSIDIAN_VAULT.exists():
        return

    rows = []
    for md in OBSIDIAN_VAULT.rglob("*.md"):
        # Skip excluded dirs/stems
        if any(ex in md.parts for ex in OBSIDIAN_EXCLUDE_STEMS):
            continue
        if md.stem in OBSIDIAN_EXCLUDE_STEMS:
            continue
        try:
            size = md.stat().st_size
        except OSError:
            continue
        if size > OBSIDIAN_MAX_SIZE:
            continue

        try:
            content = md.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue

        h = sha256(content)
        rel_path = str(md.relative_to(OBSIDIAN_VAULT))
        cache_key = f"obsidian:{rel_path}"
        if wm.get(cache_key) == h:
            continue

        title = md.stem
        tags  = _obsidian_tags(content)
        rows.append({
            "path":       rel_path,
            "title":      title,
            "content":    content[:50000],
            "tags":       tags,
            "sha256":     h,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        wm[cache_key] = h

    pushed = 0
    for i in range(0, len(rows), 50):
        pushed += sb_post("obsidian_notes", rows[i:i+50], on_conflict="path")
    if pushed:
        log.info("obsidian: synced %d notes", pushed)


# ── main loop ─────────────────────────────────────────────────────────────────

def run_pass(sources: set[str], wm: dict):
    if "room" in sources:
        try:
            sync_room(wm)
            sync_hub_to_room_file(wm)
        except Exception as e:
            log.error("room sync error: %s", e)

    if "wire" in sources:
        try:
            sync_wire(wm)
            sync_hub_to_wire_file(wm)
        except Exception as e:
            log.error("wire sync error: %s", e)

    if "tail" in sources:
        try:
            sync_tail(wm)
            sync_codex_tail(wm)
        except Exception as e:
            log.error("tail sync error: %s", e)

    if "imp" in sources:
        try:
            sync_imp(wm)
        except Exception as e:
            log.error("imp sync error: %s", e)

    if "obsidian" in sources:
        try:
            sync_obsidian(wm)
        except Exception as e:
            log.error("obsidian sync error: %s", e)

    save_watermarks(wm)


def main():
    parser = argparse.ArgumentParser(description="Hub bridge daemon")
    parser.add_argument("--once", action="store_true", help="single pass and exit")
    parser.add_argument("--source", default="all", help="room|wire|tail|imp|obsidian|all (default: room,wire,tail,imp)")
    parser.add_argument("--with-obsidian", action="store_true", help="also sync Obsidian vault (requires OBSIDIAN_VAULT_PATH env var)")
    args = parser.parse_args()

    if not SERVICE_KEY:
        log.error("HUB_SERVICE_KEY not set — cannot sync. Set it with:")
        log.error('  [System.Environment]::SetEnvironmentVariable("HUB_SERVICE_KEY", "<value>", "User")')
        sys.exit(1)

    VALID_SOURCES = {"room", "wire", "tail", "imp", "obsidian"}

    if args.source == "all":
        sources = {"room", "wire", "tail", "imp"}
        if args.with_obsidian:
            sources.add("obsidian")
    else:
        sources = {s.strip() for s in args.source.split(",")}
        invalid = sources - VALID_SOURCES
        if invalid:
            log.error("Unknown source(s): %s. Valid: %s", sorted(invalid), sorted(VALID_SOURCES))
            sys.exit(1)
        if "obsidian" in sources and not args.with_obsidian:
            log.error("--source obsidian requires --with-obsidian flag")
            sys.exit(1)

    if "obsidian" in sources and not os.environ.get("OBSIDIAN_VAULT_PATH"):
        log.error("Obsidian sync requires OBSIDIAN_VAULT_PATH env var to be set")
        sys.exit(1)

    log.info("bridge starting. sources=%s once=%s", sources, args.once)

    wm = load_watermarks()

    if args.once:
        run_pass(sources, wm)
        return

    # Continuous loop: fast sources every 10s, slow sources every 60s
    fast = {"room", "wire", "tail"}
    slow = {"imp", "obsidian"}
    tick = 0

    while True:
        active = sources & fast
        if tick % 6 == 0:          # every ~60s
            active = active | (sources & slow)
        run_pass(active, wm)
        tick += 1
        time.sleep(10)


if __name__ == "__main__":
    main()
