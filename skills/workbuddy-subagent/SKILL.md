---
name: workbuddy-subagent
description: Delegate scoped work to Claude or GPT sessions through WorkBuddy's bundled CLI, then supervise, resume and verify them. Use when the user asks for WorkBuddy, when an independent thinking partner, reviewer or executor would help, or to recover an existing WorkBuddy task. Prefers Claude for planning, design and writing and GPT for factual review and precise execution, unless the user chooses otherwise.
---

# WorkBuddy Subagent

Run an independent Claude or GPT session through WorkBuddy's installed CLI and existing login, watch it in a local read-only panel, and resume it by session ID. The parent agent owns the brief, supervision, verification and delivery. The panel only observes; this is not a native subagent, scheduler or task controller.

## Setup

Resolve `SKILL_DIR` to this file's directory and use absolute paths for the helper, workspace, brief and log. Requires WorkBuddy with a signed-in desktop app, Python 3.9+ and Node.js 18.20.8+. Automatic discovery and native login initialization are validated only on macOS (WorkBuddy 5.7.6 / CLI 2.156.0, 2026-10-09).

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" doctor
python3 "$SKILL_DIR/scripts/workbuddy.py" models --cwd /absolute/workspace
```

Encrypted installations authenticate the CLI through the [native credential bootstrap](references/compatibility.md#native-credential-bootstrap), which needs the installation owner's consent once. That consent lives outside the skill in `~/.workbuddy-subagent/config.json`, bound to the WorkBuddy data directory, and is reused without asking again; `doctor` reports `native_bootstrap_enabled`. Never import consent from another installation or a downloaded skill.

## Choose the model

An explicit user choice of provider or model wins. Otherwise route by the user's preference:

| Profile | Family | Use for |
| --- | --- | --- |
| `brainstorm` | Claude | Plans, architecture, tradeoffs, product decisions, ideation |
| `design` | Claude | UI layout, hierarchy, interaction states |
| `writing` | Claude | Writing, editing, technical articles |
| `review` | GPT | Factual investigation, claim and premise checks, code review |
| `execute` (default) | GPT | Precise implementation of an agreed plan, debugging, reproducible verification |

`--profile` only labels the run; `--model` selects the model. Use the latest, strongest general model of that family according to current vendor guidance, among those WorkBuddy actually exposes, and pass its exact ID on every new and resumed call. If WorkBuddy lacks the vendor's flagship, say which model you used instead. Record the ID and reuse it within the task. Resolution steps and dated evidence: [model policy](references/model-policy.md).

These are preferences, not guarantees; code, tests and sources settle factual questions. Bring in a second model when the task warrants it, for example GPT checking the falsifiable premises of a Claude proposal, and present subjective disagreements to the user as tradeoffs. Do not delegate trivial or already-decided work.

## Brief and run

The session does not see this conversation. Give it a self-contained UTF-8 brief: objective, relevant context and evidence, repository instructions and user constraints, allowed paths and tools (writes elsewhere, including persistent memory, are out of scope), acceptance criteria, and what the parent will do afterwards, such as builds, tests or delivery. Ask for conclusions with evidence. The brief is sent as text, so files it mentions must be readable from `--cwd` or included in it. Hooks, MCP servers and project CLI settings are not loaded. See [example briefs](references/model-policy.md#example-briefs).

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/workspace --profile review --model "$MODEL_ID" \
  --title "Short task name" \
  --prompt-file /absolute/task/brief.md --output /absolute/task/turn-1.jsonl
```

Defaults: `--effort high`, no turn cap, `--timeout 0` (no deadline), and read-only tools `Read,Glob,Grep` in `plan` mode. Adjust to the task:

- Discussion of supplied text: `--tools ''`.
- Authorized edits: `--permission-mode acceptEdits --tools Read,Glob,Grep,Edit,Write`, preferably in an isolated checkout. Add `Bash` when shell work belongs to the delegated scope; leave it out when the parent owns builds and tests.
- `--max-turns` or a nonzero `--timeout` only when the user asks for a cap.

`--output` must be a new path in durable private storage, not an OS temporary or build directory. Without it, the monitor keeps a private log under `~/.workbuddy-subagent/monitor/runs`; with `--no-monitor` as well, no log is written. Keep logs and checkpoints out of published artifacts. The command first prints `session_id`, `model`, `output` and `monitor_url`, then the final result, and exits nonzero on failure.

Tool filters and permission modes are not a filesystem sandbox, and the stream's initial tool list is not the effective filter, so judge scope by actual tool events and changed paths. When an operation is denied, work out whether the path, tool or scope was wrong, then correct the brief or do the parent-owned part yourself; do not retry, switch tools or widen permissions to get around it. Preserve authorized edits. Normal tool use needs no extra approval step, and a difficulty is something to diagnose, not a reason to abandon authorized work.

## Monitor and supervise

Open `monitor_url` in the host's browser panel, reusing an open panel when practical. In Codex: `open_in_codex` with `target: {type: "browser", url: monitor_url}` and `placement: "right"`. The panel shows public output, tool calls, edit previews and sanitized activity; it cannot steer or stop a run, and closing it or running `monitor stop` leaves the task running. `--no-monitor` opts out. Details: [monitoring](references/monitoring.md).

Launch long runs in the host's persistent execution session and keep its handle. While waiting, use a heartbeat on the current task, normally every five minutes, pointed at a durable checkpoint recording the session ID, exact model, workspace, execution handle, log path, scope, validation state and remaining steps. At each check, compare activity, public output and file changes with the acceptance criteria. Let productive work continue, including quiet thinking. Intervene for repeated failures, loops, scope drift or new user direction: stop the runner through its handle, wait for it to exit and inspect its edits before resuming. Keep unchanged checks quiet, but answer a direct status request explicitly. When the run ends, finish the authorized validation and delivery, then pause this task's heartbeat.

Without a persistent execution session, say so rather than promising unattended work. Native background jobs (`--bg`, `agents --jobs`) are unverified; do not rely on them.

## Resume

Resume only after the previous turn has exited or its runner is confirmed gone. Never send overlapping turns or use `--continue`. Reuse the recorded model, pass the tool and permission flags the follow-up needs (they are not inherited), and write a new log:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/workspace --resume SESSION_ID --model "$SESSION_MODEL" \
  --prompt-file /absolute/task/follow-up.md --output /absolute/task/turn-2.jsonl
```

Start a new session for an independent opinion. After a host restart, a missing handle or a lost log, follow [interruption recovery](references/monitoring.md#interruption-recovery); none of these shows that the task finished.

## Verify

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" result /absolute/task/turn-2.jsonl --model "$SESSION_MODEL"
```

A pass means a nonempty successful result from the expected model with no reported errors or permission denials. It does not audit individual tool calls, enforce scope or check the work. The parent reviews the actual changes against the source, runs the repository's required checks and decides acceptance, reporting only checks actually run and the revision they covered. Weigh review findings by their evidence, and resume the author or reviewer with that evidence while issues remain open.

On failure, keep the log, diagnostics and edits, and diagnose before resuming. For `Authentication required` or HTTP 401, see [authentication failures](references/compatibility.md#authentication-failures). Never switch models silently, export credentials or disable encryption.
