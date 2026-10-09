#!/usr/bin/env python3
"""Private, read-only loopback dashboard for WorkBuddy JSONL transcripts (stdlib only)."""
import argparse
import difflib
import fcntl
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ASSETS = Path(__file__).resolve().parents[1] / "assets" / "monitor"
ACTIVE = {"starting", "running"}
LIMIT = 60000


def state_dir(value=None):
    root = Path(value or os.environ.get("WORKBUDDY_MONITOR_DIR", Path.home() / ".workbuddy-subagent/monitor")).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    (root / "runs").mkdir(exist_ok=True, mode=0o700)
    return root


def save(path, value):
    temp = path.with_name(path.name + "." + secrets.token_hex(6) + ".tmp")
    fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(value, stream, ensure_ascii=False)
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def read(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def alive(pid):
    try:
        os.kill(int(pid), 0)
        return True
    except (ValueError, TypeError, OSError):
        return False


def run_info(path):
    info = read(path)
    if info.get("status") in ACTIVE and (not alive(info.get("pid")) or time.time() - info.get("heartbeat", 0) > 15):
        info = dict(info, status="interrupted", finished=info.get("heartbeat", info.get("started")),
                    error="The task runner stopped reporting. Inspect the transcript and workspace before resuming.")
    return info


def server_info(root):
    info = read(root / "server.json")
    try:
        if not alive(info.get("pid")) or not isinstance(info.get("token"), str):
            return {}
        url = f"http://127.0.0.1:{int(info['port'])}/{info['token']}/health"
        # Local requests must not be routed through a configured HTTP proxy.
        import urllib.request
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url, timeout=1) as response:
            if json.load(response) == {"pid": info["pid"], "service": "workbuddy-monitor-v1"}:
                return info
    except (OSError, ValueError, KeyError):
        pass
    return {}


def ensure_server(root):
    with (root / "start.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        info = server_info(root)
        if not info:
            proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "serve", "--state-dir", str(root)],
                                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    start_new_session=True, close_fds=True)
            for _ in range(60):
                info = server_info(root)
                if info:
                    break
                if proc.poll() is not None:
                    raise RuntimeError("Monitor server failed to start; run monitor.py serve for diagnostics.")
                time.sleep(0.05)
            if not info:
                proc.terminate()
                raise RuntimeError("Monitor startup timed out.")
        return f"http://127.0.0.1:{info['port']}/{info['token']}/"


class RunRecord:
    def __init__(self, root, **info):
        self.root = root
        self.id = secrets.token_hex(12)
        self.path = root / "runs" / (self.id + ".json")
        self.info = dict(info, id=self.id, pid=os.getpid(), started=time.time(), status="starting")
        self.lock = threading.Lock()
        self.done = threading.Event()
        self.update()
        self.thread = threading.Thread(target=self.beat, daemon=True)
        self.thread.start()

    def update(self, **values):
        with self.lock:
            self.info.update(values, heartbeat=time.time())
            save(self.path, self.info)

    def beat(self):
        while not self.done.wait(2):
            try:
                self.update()
            except OSError:
                return

    def finish(self, status, **values):
        self.done.set()
        self.thread.join(timeout=3)
        self.update(status=status, finished=time.time(), **values)


def clipped(value):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)
    return text[:LIMIT] + ("\n[Display truncated; see the private JSONL log.]" if len(text) > LIMIT else "")


def public_content(value):
    if isinstance(value, str):
        return clipped(value)
    if isinstance(value, list):
        return clipped("\n".join(b.get("text", "") for b in value if isinstance(b, dict) and b.get("type") == "text"))
    return ""


class Projection:
    """Allowlisted public transcript. Raw metadata and thinking never leave this class."""
    def __init__(self):
        self.cards = {}
        self.blocks = {}
        self.message_id = "unknown"
        self.model = None
        self.final = None
        self.changed = {}
        self.text_blocks = {}
        self.streamed = set()
        self.envelope_indexes = {}
        self.envelope_counter = 0
        self.activity = {"phase": "waiting", "last_event_at": None, "events": 0}

    def put(self, key, **values):
        card = self.cards.setdefault(key, {"id": key})
        card.update(values)
        self.changed[key] = dict(card)

    def text(self, mid, index, value, streaming):
        blocks = self.text_blocks.setdefault(mid, {})
        blocks[index] = clipped(value)
        combined = clipped("\n".join(blocks[i] for i in sorted(blocks)))
        if combined:
            self.put(mid + ":text", kind="text", text=combined, streaming=streaming)

    def complete_text(self, mid, texts, envelope_id=None):
        blocks = self.text_blocks.setdefault(mid, {})
        if mid in self.streamed:
            indexes = sorted(blocks)
            if len(texts) == len(indexes):
                for index, value in zip(indexes, texts):
                    self.text(mid, index, value, False)
            else:
                # Native CLI may emit one completed envelope per streamed block.
                for value in texts:
                    if value not in blocks.values():
                        self.text(mid, indexes[-1] if indexes else 0, value, False)
                if mid + ":text" in self.cards:
                    self.put(mid + ":text", streaming=False)
        else:
            # Completed-only envelopes have their own UUIDs. Equal text does
            # not imply replay: two different blocks may intentionally repeat.
            self.envelope_counter += 1
            identity = (mid, envelope_id or f"anonymous:{self.envelope_counter}")
            indexes = self.envelope_indexes.get(identity)
            if indexes is None:
                start = max(blocks, default=-1) + 1
                indexes = list(range(start, start + len(texts)))
                self.envelope_indexes[identity] = indexes
            for index, value in zip(indexes, texts):
                self.text(mid, index, value, False)

    def tool(self, block, partial=False):
        key = "tool:" + str(block.get("id", "unknown"))
        old = self.cards.get(key, {})
        args = block.get("input", {})
        data = dict(kind="tool", name=block.get("name", "Tool"), input=clipped(args),
                    state=old.get("state", "preparing" if partial else "running"))
        if not partial and data["state"] == "preparing":
            data["state"] = "running"
        if isinstance(args, dict):
            data["path"] = str(args.get("file_path", args.get("path", "")))
            name = str(block.get("name", "")).lower()
            if name == "edit" and isinstance(args.get("old_string"), str) and isinstance(args.get("new_string"), str):
                data["diff_format"] = "unified"
                data["diff"] = clipped("\n".join(difflib.unified_diff(args["old_string"].splitlines(), args["new_string"].splitlines(), fromfile="before", tofile="after", lineterm="")))
            elif name == "write" and isinstance(args.get("content"), str):
                data["diff_format"] = "additions"
                data["diff"] = clipped("\n".join("+" + line for line in args["content"].splitlines()))
        self.put(key, **data)

    def accept(self, item):
        if not isinstance(item, dict):
            return
        self.activity = dict(self.activity, last_event_at=item.get("__timestamp") or self.activity["last_event_at"],
                             events=self.activity["events"] + 1)
        kind = item.get("type")
        message = item.get("message") or {}
        mid = str(item.get("_messageId") or message.get("id") or self.message_id)
        if kind == "system" and item.get("subtype") == "init":
            self.model = item.get("model")
        elif kind == "stream_event":
            event = item.get("event") or {}
            typ = event.get("type")
            if typ == "message_start":
                self.message_id = str(item.get("_messageId") or event.get("message", {}).get("id") or mid)
                return
            mid = str(item.get("_messageId") or self.message_id)
            index = event.get("index", 0)
            if typ == "content_block_start":
                block = event.get("content_block") or {}
                if block.get("type") == "text":
                    self.streamed.add(mid)
                    self.text(mid, index, block.get("text", ""), True)
                elif block.get("type") == "tool_use":
                    self.blocks[(mid, index)] = dict(block)
                    self.tool(block, partial=True)
            elif typ == "content_block_delta":
                delta = event.get("delta") or {}
                phase = {"thinking_delta": "thinking", "text_delta": "writing", "input_json_delta": "tool_input"}.get(delta.get("type"))
                if phase:
                    self.activity["phase"] = phase
                if delta.get("type") == "text_delta":
                    self.streamed.add(mid)
                    previous = self.text_blocks.get(mid, {}).get(index, "")
                    self.text(mid, index, previous + delta.get("text", ""), True)
                elif delta.get("type") == "input_json_delta":
                    block = self.blocks.get((mid, index), {})
                    if block.get("type") == "tool_use":
                        block["partial_json"] = clipped(block.get("partial_json", "") + delta.get("partial_json", ""))
                        self.put("tool:" + str(block.get("id")), input=block["partial_json"])
            elif typ == "message_stop":
                if mid + ":text" in self.cards:
                    self.put(mid + ":text", streaming=False)
        elif kind in ("assistant", "user"):
            content = message.get("content", [])
            if not isinstance(content, list):
                return
            texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
            if kind == "assistant" and texts:
                self.complete_text(mid, texts, item.get("uuid"))
            for block in content:
                if not isinstance(block, dict):
                    continue
                if block.get("type") == "tool_use":
                    self.tool(block)
                elif block.get("type") == "tool_result":
                    self.activity["phase"] = "tool_result"
                    self.put("tool:" + str(block.get("tool_use_id")), kind="tool",
                             state="failed" if block.get("is_error") else "succeeded",
                             result=public_content(block.get("content")))
        elif kind == "result":
            self.activity["phase"] = "finished"
            self.final = {"text": clipped(item.get("result", "")), "subtype": item.get("subtype"),
                          "turns": item.get("num_turns"), "models": list(item.get("modelUsage", {})),
                          "errors": clipped(item.get("errors", [])), "permission_denials": len(item.get("permission_denials") or [])}

    def snapshot(self):
        return {"cards": list(self.cards.values()), "model": self.model, "final": self.final, "activity": self.activity}


class Tail:
    def __init__(self, path):
        self.path = Path(path)
        self.offset = 0
        self.projection = Projection()
        self.identity = None

    def poll(self):
        reset = False
        try:
            with self.path.open("rb") as stream:
                stat = os.fstat(stream.fileno())
                identity = (stat.st_dev, stat.st_ino)
                if self.identity not in (None, identity) or stat.st_size < self.offset:
                    self.offset = 0
                    self.projection = Projection()
                    reset = True
                self.identity = identity
                stream.seek(self.offset)
                while True:
                    line = stream.readline()
                    if not line or not line.endswith(b"\n"):
                        break  # An incomplete line must be retried, including split UTF-8.
                    self.offset = stream.tell()
                    try:
                        self.projection.accept(json.loads(line))
                    except (ValueError, TypeError, AttributeError):
                        continue
        except FileNotFoundError:
            pass
        return reset


class MonitorServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, root):
        self.root = root
        self.token = secrets.token_urlsafe(32)
        self.last_request = time.monotonic()
        self.stopping = threading.Event()
        super().__init__(("127.0.0.1", 0), Handler)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Capability URLs and task contents must not appear in access logs.

    def response_headers(self, content_type):
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")

    def reply(self, value, content_type="application/json; charset=utf-8"):
        body = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
        self.send_response(200)
        self.response_headers(content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        expected = f"127.0.0.1:{self.server.server_port}"
        origin = self.headers.get("Origin")
        if self.headers.get("Host") != expected or (origin and origin != "http://" + expected):
            self.send_error(403)
            return
        prefix = "/" + self.server.token + "/"
        path = urlsplit(self.path).path
        if not path.startswith(prefix):
            self.send_error(404)
            return
        route = path[len(prefix):]
        self.server.last_request = time.monotonic()
        if route == "health":
            self.reply({"pid": os.getpid(), "service": "workbuddy-monitor-v1"})
        elif route == "runs":
            runs = [run_info(p) for p in (self.server.root / "runs").glob("*.json")]
            self.reply(sorted((r for r in runs if r.get("id")), key=lambda r: r.get("started", 0), reverse=True))
        elif route in ("", "app.js", "preferences.js", "markdown.js", "vendor/marked.js", "vendor/purify.js", "style.css"):
            name, mime = {"": ("index.html", "text/html; charset=utf-8"), "app.js": ("app.js", "text/javascript; charset=utf-8"),
                          "preferences.js": ("preferences.js", "text/javascript; charset=utf-8"),
                          "markdown.js": ("markdown.js", "text/javascript; charset=utf-8"),
                          "vendor/marked.js": ("vendor/marked.js", "text/javascript; charset=utf-8"),
                          "vendor/purify.js": ("vendor/purify.js", "text/javascript; charset=utf-8"),
                          "style.css": ("style.css", "text/css; charset=utf-8")}[route]
            self.reply((ASSETS / name).read_bytes(), mime)
        elif route.startswith("events/"):
            ident = route.split("/", 1)[1]
            if len(ident) != 24 or any(c not in "0123456789abcdef" for c in ident):
                self.send_error(404)
                return
            record = self.server.root / "runs" / (ident + ".json")
            info = run_info(record)
            if not info.get("output"):
                self.send_error(404)
                return
            self.events(record, info)
        else:
            self.send_error(404)

    def events(self, record, info):
        self.send_response(200)
        self.response_headers("text/event-stream; charset=utf-8")
        self.end_headers()
        tail = Tail(info["output"])
        initial = True
        last_info = None
        last_final = None
        last_activity = None
        last_ping = time.monotonic()
        try:
            while not self.server.stopping.is_set():
                reset = tail.poll()
                info = run_info(record)
                if info.get("status") not in ACTIVE:
                    # The runner may append its final line and finish between poll and read.
                    reset = tail.poll() or reset
                    for key, card in list(tail.projection.cards.items()):
                        if card.get("streaming"):
                            tail.projection.put(key, streaming=False)
                        if card.get("kind") == "tool" and card.get("state") in ("preparing", "running"):
                            tail.projection.put(key, state="incomplete")
                # Heartbeats keep process status accurate without causing UI updates.
                public_info = {k: v for k, v in info.items() if k != "heartbeat"}
                projection = tail.projection
                if initial or reset:
                    self.event("snapshot", dict(projection.snapshot(), run=public_info))
                    initial = False
                elif projection.changed or public_info != last_info or projection.final != last_final or projection.activity != last_activity:
                    self.event("update", {"cards": list(projection.changed.values()), "model": projection.model,
                                          "final": projection.final, "run": public_info, "activity": projection.activity})
                projection.changed.clear()
                last_info, last_final = public_info, projection.final
                last_activity = projection.activity
                if info.get("status") not in ACTIVE:
                    self.event("done", {})
                    return
                if time.monotonic() - last_ping > 10:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    last_ping = time.monotonic()
                self.server.last_request = time.monotonic()
                self.server.stopping.wait(0.2)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def event(self, name, value):
        self.wfile.write(("event: " + name + "\ndata: " + json.dumps(value, ensure_ascii=False) + "\n\n").encode())
        self.wfile.flush()


def serve(root):
    with (root / "server.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        server = MonitorServer(root)
        save(root / "server.json", {"pid": os.getpid(), "port": server.server_port, "token": server.token})
        def stop(*_):
            server.stopping.set()
            threading.Thread(target=server.shutdown, daemon=True).start()
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        def idle():
            while not server.stopping.wait(30):
                if time.monotonic() - server.last_request > 1800:
                    if not any(run_info(p).get("status") in ACTIVE for p in (root / "runs").glob("*.json")):
                        stop()
        threading.Thread(target=idle, daemon=True).start()
        try:
            server.serve_forever(poll_interval=0.2)
        finally:
            server.server_close()
            if read(root / "server.json").get("pid") == os.getpid():
                (root / "server.json").unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "status", "stop", "serve"], nargs="?", default="start")
    parser.add_argument("--state-dir")
    args = parser.parse_args(argv)
    root = state_dir(args.state_dir)
    if args.action == "serve":
        serve(root)
        return 0
    if args.action == "start":
        print(json.dumps({"monitor_url": ensure_server(root), "state_dir": str(root)}))
    else:
        info = server_info(root)
        if args.action == "stop" and info:
            os.kill(info["pid"], signal.SIGTERM)
            for _ in range(40):
                if not server_info(root):
                    break
                time.sleep(0.05)
        print(json.dumps({"running": bool(server_info(root)), "state_dir": str(root),
                          **({"monitor_url": f"http://127.0.0.1:{info['port']}/{info['token']}/"} if info and args.action == "status" else {})}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
