"""
capture.py — mechanically ingest Claude Code transcripts into the Hub Supabase spine.
Fires on SessionStart, Stop, and PreCompact hooks via capture.ps1.
Deployed path: C:\\imp\\scripts\\capture.py (this repo copy is the reviewed source).

Zero AI judgment. Pure mechanical extraction + redaction.
Failed uploads spool to disk and drain on the next run — nothing is ever lost.

Env vars required:
  HUB_SERVICE_KEY  — Supabase service role key (Windows user env var)
"""
import json, sys, os, re, hashlib, pathlib, time, uuid
from datetime import datetime, timezone
import urllib.request, urllib.error, urllib.parse

SUPABASE_URL    = "https://tzvutctcvnqzqjaxfktz.supabase.co"
PROJECTS_DIR    = pathlib.Path.home() / ".claude" / "projects"
SCRIPT_DIR      = pathlib.Path(r"C:\imp\scripts")
SPOOL_DIR       = SCRIPT_DIR / ".capture-spool"
LOCK_FILE       = SCRIPT_DIR / ".capture.lock"
DEBOUNCE_FILE   = SCRIPT_DIR / ".capture-last-run"
MAX_CONTENT     = 4000    # chars per chunk before truncation
BATCH_SIZE      = 50
DEBOUNCE_SECS   = 300     # skip run entirely if one finished < 5 min ago
LOCK_STALE_SECS = 600     # a lock older than this is from a dead run — steal it
SPOOL_MAX_TRIES = 5       # after this many failed drains a spool file dead-letters

OK_STATUSES = (200, 201, 204, 409)  # 409 = duplicate — already stored, success

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I
)

# Hard denylist — these paths NEVER upload under any circumstances
DENYLIST = [
    r"AIEG-Private",
    r"AIEG-Tools",
    r"claude-batch-extract",
    r"sealed",
    r"AIEG.*\.txt",
]

# Secret patterns — redact before anything leaves the machine
REDACT = [
    (re.compile(r"sk-[A-Za-z0-9\-_]{20,}"),                          "[REDACTED_SK]"),
    (re.compile(r"ghp_[A-Za-z0-9]{36}"),                             "[REDACTED_GHP]"),
    (re.compile(r"github_pat_[A-Za-z0-9_]{22,}"),                    "[REDACTED_GH_PAT]"),
    (re.compile(r"AKIA[A-Z0-9]{16}"),                                "[REDACTED_AKIA]"),
    (re.compile(r"sbp_[A-Za-z0-9]{36}"),                             "[REDACTED_SBP]"),
    (re.compile(r"sb_secret_[A-Za-z0-9\-_]{20,}"),                   "[REDACTED_SB_SECRET]"),
    (re.compile(r"xox[bp]-[A-Za-z0-9\-]{10,}"),                      "[REDACTED_SLACK]"),
    (re.compile(r"-----BEGIN[A-Z ]*PRIVATE KEY-----.*?-----END[A-Z ]*PRIVATE KEY-----", re.S),
                                                                     "[REDACTED_PRIVATE_KEY]"),
    (re.compile(r"eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+"), "[REDACTED_JWT]"),
    (re.compile(r"(?i)(password|secret|api[_-]?key|token)\s*[=:]\s*\S{6,}"), "[REDACTED_CRED]"),
]

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

def get_key():
    key = os.environ.get("HUB_SERVICE_KEY")
    if not key:
        print("capture: HUB_SERVICE_KEY not set — skipping", flush=True)
        sys.exit(0)
    return key

def is_denylisted(path_str):
    return any(re.search(p, path_str) for p in DENYLIST)

def redact(text):
    for pattern, replacement in REDACT:
        text = pattern.sub(replacement, text)
    return text

def extract_text(content):
    if isinstance(content, str):
        return content.strip()
    parts = []
    for block in content:
        if isinstance(block, dict) and block.get("type") == "text":
            t = block.get("text", "").strip()
            if t:
                parts.append(t)
    return "\n".join(parts)

def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

# ── Lock + debounce ───────────────────────────────────────────────────────────

def acquire_lock():
    try:
        if LOCK_FILE.exists():
            if time.time() - LOCK_FILE.stat().st_mtime < LOCK_STALE_SECS:
                return False
            LOCK_FILE.unlink(missing_ok=True)  # stale lock from a dead run
        fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        return True
    except (FileExistsError, OSError):
        return False

def release_lock():
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except OSError:
        pass

def debounced():
    try:
        last = float(DEBOUNCE_FILE.read_text().strip())
    except (OSError, ValueError):
        return False
    return (time.time() - last) < DEBOUNCE_SECS

def mark_run():
    try:
        DEBOUNCE_FILE.write_text(str(time.time()))
    except OSError:
        pass

# ── Supabase helpers ──────────────────────────────────────────────────────────

def _headers(key):
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

def sb_get(key, table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers=_headers(key))
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception:
        return None

def sb_post(key, table, data, params="", prefer="resolution=ignore-duplicates,return=minimal"):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if params:
        url += f"?{params}"
    body = json.dumps(data).encode("utf-8")
    h = {**_headers(key), "Prefer": prefer}
    req = urllib.request.Request(url, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        if e.code not in OK_STATUSES:
            print(f"  POST {table} -> HTTP {e.code}: {e.read()[:200]}", flush=True)
        return e.code
    except Exception as e:
        print(f"  POST {table} -> error: {e}", flush=True)
        return None

def sb_patch(key, table, params, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    body = json.dumps(data).encode("utf-8")
    h = {**_headers(key), "Prefer": "return=minimal"}
    req = urllib.request.Request(url, data=body, headers=h, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except Exception as e:
        print(f"  PATCH {table} -> error: {e}", flush=True)
        return None

# ── Watermarks ────────────────────────────────────────────────────────────────

def get_all_watermarks(key):
    """Single fetch of every watermark. Returns dict or None if unreachable."""
    result = sb_get(key, "ingest_watermarks", "select=source_key,byte_offset")
    if result is None:
        return None
    return {row["source_key"]: int(row.get("byte_offset", 0)) for row in result}

def set_watermark(key, source_key, offset):
    data = {
        "source_key": source_key,
        "byte_offset": offset,
        "updated_at": utc_now_iso(),
    }
    sb_post(key, "ingest_watermarks", data, params="on_conflict=source_key",
            prefer="resolution=merge-duplicates,return=minimal")

# ── Projects + sessions ───────────────────────────────────────────────────────

_project_cache = {}

def ensure_project(key, dir_name):
    """Upsert a project row keyed by the transcript folder name; return its id."""
    if dir_name in _project_cache:
        return _project_cache[dir_name]
    # Folder names encode the cwd, e.g. "C--Users-mandy-anew-math" -> "anew-math"
    name = re.sub(r"^C--Users-mandy-?", "", dir_name, flags=re.I) or dir_name
    sb_post(key, "projects", {"slug": dir_name, "name": name}, params="on_conflict=slug")
    rows = sb_get(key, "projects",
                  f"slug=eq.{urllib.parse.quote(dir_name, safe='')}&select=id")
    pid = rows[0]["id"] if rows else None
    _project_cache[dir_name] = pid
    return pid

def session_id_for(jsonl_path):
    """Claude Code transcript filenames are session UUIDs. Fall back to a
    deterministic uuid5 of the path so the id is stable across runs."""
    stem = jsonl_path.stem
    if UUID_RE.match(stem):
        return stem.lower()
    return str(uuid.uuid5(uuid.NAMESPACE_URL, str(jsonl_path)))

# ── Spool (offline safety net) ────────────────────────────────────────────────

def spool_write(session_row, chunks, source_key):
    SPOOL_DIR.mkdir(parents=True, exist_ok=True)
    ts = int(time.time())
    tag = hashlib.md5(source_key.encode()).hexdigest()[:8]
    f = SPOOL_DIR / f"{ts}_{tag}_{os.getpid()}.json"
    f.write_text(json.dumps({
        "source_key": source_key,
        "session": session_row,
        "chunks": chunks,
        "attempts": 0,
    }), encoding="utf-8")
    print(f"  spooled {len(chunks)} chunks -> {f.name}", flush=True)

def drain_spool(key):
    if not SPOOL_DIR.exists():
        return
    for f in sorted(SPOOL_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  spool unreadable, dead-lettering {f.name}: {e}", flush=True)
            f.rename(f.with_suffix(".deadletter"))
            continue
        ok = True
        session_row = data.get("session")
        if session_row:
            status = sb_post(key, "sessions", session_row, params="on_conflict=id")
            ok = status in OK_STATUSES
        if ok:
            status = sb_post(key, "chunks", data["chunks"],
                             params="on_conflict=content_hash")
            ok = status in OK_STATUSES
        if ok:
            f.unlink()
            print(f"  drained spool: {f.name}", flush=True)
        else:
            attempts = data.get("attempts", 0) + 1
            if attempts >= SPOOL_MAX_TRIES:
                f.rename(f.with_suffix(".deadletter"))
                print(f"  dead-lettered after {attempts} tries: {f.name}", flush=True)
            else:
                data["attempts"] = attempts
                f.write_text(json.dumps(data), encoding="utf-8")

# ── Per-file capture ──────────────────────────────────────────────────────────

def process_file(key, jsonl_path, watermark):
    source_key = str(jsonl_path)
    print(f"  {jsonl_path.name} offset={watermark}", flush=True)

    session_id = session_id_for(jsonl_path)
    project_id = ensure_project(key, jsonl_path.parent.name)

    chunks = []
    new_offset = watermark
    first_ts = None
    last_ts = None

    with open(jsonl_path, "rb") as f:
        f.seek(watermark)
        while True:
            line_start = f.tell()
            raw = f.readline()
            if not raw:
                break
            new_offset = f.tell()

            try:
                obj = json.loads(raw.decode("utf-8", errors="replace"))
            except Exception:
                continue

            if obj.get("type") not in ("user", "assistant"):
                continue

            msg = obj.get("message", {})
            text = extract_text(msg.get("content", ""))
            if not text:
                continue

            text = redact(text)
            if len(text) > MAX_CONTENT:
                text = text[:MAX_CONTENT] + " [...truncated]"

            speaker = "mandy" if msg.get("role") == "user" else "claude"
            ts_raw = obj.get("timestamp") or utc_now_iso()
            if first_ts is None:
                first_ts = ts_raw
            last_ts = ts_raw

            chunks.append({
                "session_id":   session_id,
                "project_id":   project_id,
                "source_type":  "transcript",
                # source_key + line offset makes the hash position-unique, so
                # identical text in two places is stored twice (correct), while
                # re-reading the same bytes dedupes (also correct).
                "source_ref":   {"file": source_key, "offset": line_start},
                "speaker":      speaker,
                "content":      text,
                "content_hash": sha256(f"{source_key}|{line_start}|{text}"),
                "ts":           ts_raw,
                "sensitivity":  1,
            })

    if not chunks:
        # Advance past non-message lines so we don't rescan them forever.
        if new_offset > watermark:
            set_watermark(key, source_key, new_offset)
        return

    # Session row must exist before chunks (FK). Idempotent insert.
    session_row = {
        "id":              session_id,
        "project_id":      project_id,
        "agent":           "claude",
        "transcript_path": source_key,
        "started_at":      first_ts,
    }
    status = sb_post(key, "sessions", session_row, params="on_conflict=id")
    if status not in OK_STATUSES:
        spool_write(session_row, chunks, source_key)
        return  # watermark untouched — retried next run

    all_ok = True
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        status = sb_post(key, "chunks", batch, params="on_conflict=content_hash")
        if status not in OK_STATUSES:
            all_ok = False
            spool_write(session_row, batch, source_key)

    if all_ok and new_offset > watermark:
        sb_patch(key, "sessions",
                 f"id=eq.{session_id}", {"ended_at": last_ts})
        set_watermark(key, source_key, new_offset)

    print(f"  -> {len(chunks)} chunks", flush=True)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    key = get_key()

    if debounced():
        print("capture: ran < 5 min ago — debounced", flush=True)
        return

    if not acquire_lock():
        print("capture: another run holds the lock — skipping", flush=True)
        return

    try:
        mark_run()
        print(f"capture.py {utc_now_iso()}", flush=True)

        drain_spool(key)

        watermarks = get_all_watermarks(key)
        if watermarks is None:
            print("capture: Supabase unreachable — will retry next run", flush=True)
            return

        # Any transcript whose size exceeds its watermark has uncaptured
        # content — no time window, so killed terminals are caught by the
        # next SessionStart hook no matter how old the file is.
        pending = []
        for t in PROJECTS_DIR.glob("*/*.jsonl"):
            if not t.is_file() or is_denylisted(str(t)):
                continue
            if t.stat().st_size > watermarks.get(str(t), 0):
                pending.append(t)

        for t in sorted(pending, key=lambda f: f.stat().st_mtime):
            process_file(key, t, watermarks.get(str(t), 0))

        print("capture.py done", flush=True)
    finally:
        release_lock()

if __name__ == "__main__":
    main()
