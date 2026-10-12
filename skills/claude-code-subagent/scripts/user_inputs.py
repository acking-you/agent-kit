"""Read only user-supplied input for one managed native turn."""
import json
import os
from pathlib import Path
import re

MAX_TEXT = 60000
MAX_MESSAGES = 64
MAX_TOTAL_TEXT = 240000
MANAGED = re.compile(r"^\[Managed task turn [a-f0-9]{24}\](?:\n|$)")


def read_record(path):
    try:
        value = json.loads(Path(path).read_text() if path else "{}")
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def user_input(item):
    """Allowlist text and attachment kinds, excluding native bookkeeping."""
    if item.get("type") != "user" or item.get("isMeta") or item.get("isCompactSummary"):
        return None
    message = item.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    if isinstance(content, str):
        return content, []
    if not isinstance(content, list):
        return None
    texts, attachments = [], []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and isinstance(block.get("text"), str):
            texts.append(block["text"])
        elif block.get("type") in ("image", "document"):
            if block["type"] not in attachments:
                attachments.append(block["type"])
    return ("\n".join(texts), attachments) if texts or attachments else None


class UserInputs:
    """Incrementally read a turn without polling or mutating native job state."""
    def __init__(self, root, info):
        self.root = Path(root)
        self.info = info
        self.identity = None
        self.reset()

    def reset(self):
        self.offset = 0
        self.started = False
        self.ended = False
        self.messages = []
        self.seen = set()
        self.local_commands = set()
        self.omitted = 0

    def snapshot(self):
        hook = read_record(self.info.get("hook_record"))
        path = hook.get("transcript_path") or self.info.get("transcript_path")
        readable = False
        if path:
            try:
                with open(path, "rb") as stream:
                    stat = os.fstat(stream.fileno())
                    identity = (str(path), stat.st_dev, stat.st_ino)
                    if identity != self.identity or stat.st_size < self.offset:
                        self.reset()
                        self.identity = identity
                    readable = True
                    stream.seek(self.offset)
                    while not self.ended:
                        start = stream.tell()
                        line = stream.readline()
                        if not line or not line.endswith(b"\n"):
                            break
                        self.offset = stream.tell()
                        try:
                            item = json.loads(line)
                        except ValueError:
                            continue
                        if not isinstance(item, dict):
                            continue
                        # Native local commands share a prompt ID with their meta caveat.
                        message = item.get("message")
                        raw = message.get("content") if isinstance(message, dict) else None
                        prompt_id = item.get("promptId")
                        if (item.get("type") == "user" and item.get("isMeta") and
                                isinstance(raw, str) and raw.startswith("<local-command-caveat>") and
                                isinstance(prompt_id, str)):
                            self.local_commands.add(prompt_id)
                        if isinstance(prompt_id, str) and prompt_id in self.local_commands:
                            continue
                        content = user_input(item)
                        if content is None:
                            continue
                        text, attachments = content
                        marker = self.info["marker"]
                        current = text == marker or text.startswith(marker + "\n")
                        if current:
                            self.started = True
                            text = text[len(marker):].removeprefix("\n")
                        elif self.started and MANAGED.match(text):
                            self.ended = True
                            break
                        if not self.started:
                            continue
                        key = str(item.get("uuid") or f"offset:{start}")
                        if key in self.seen:
                            continue
                        self.seen.add(key)
                        self.messages.append({
                            "id": key, "text": text[:MAX_TEXT],
                            "truncated": len(text) > MAX_TEXT,
                            "attachments": attachments,
                            "timestamp": item.get("timestamp") if isinstance(item.get("timestamp"), str) else None,
                        })
                        while len(self.messages) > MAX_MESSAGES or sum(len(m["text"]) for m in self.messages) > MAX_TOTAL_TEXT:
                            self.messages.pop(1)
                            self.omitted += 1
            except OSError:
                pass
        if self.started:
            return {"source": "transcript", "messages": list(self.messages),
                    "omitted": self.omitted, "unavailable": not readable}
        try:
            with (self.root / "tasks" / self.info["id"] / "brief.md").open() as brief:
                text = brief.read(MAX_TEXT + 1)
        except (OSError, UnicodeError):
            return {"source": "unavailable", "messages": [], "omitted": 0}
        return {"source": "brief", "messages": [{"id": "brief", "text": text[:MAX_TEXT],
                "truncated": len(text) > MAX_TEXT, "attachments": [], "timestamp": None}], "omitted": 0}
