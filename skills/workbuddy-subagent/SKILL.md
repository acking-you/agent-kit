---
name: workbuddy-subagent
description: Run WorkBuddy's bundled CLI as a resumable external subagent. Route plan/architecture discussion, tradeoffs, product decisions, ideation, frontend design and writing to the latest strongest Claude; route factual investigation, verification/review and precise execution to the latest strongest GPT. Use when WorkBuddy is requested, a task benefits from an outside thinking partner or verifier, or a WorkBuddy session should continue.
---

# WorkBuddy Subagent

Runs an independent model session through WorkBuddy's installed CLI and existing login. The parent agent owns scope, verification and delivery. This is an external subagent with a read-only observer panel, not a native Codex subagent, loop registration or autonomous scheduler.

## Setup

- Resolve `SKILL_DIR` to this file's directory. Use absolute paths for the helper, workspace, brief and log.
- Requires Python 3.9+, Node.js 18.20.8+ and WorkBuddy. Automatic discovery is macOS only. Tested setup: WorkBuddy 5.7.6 / CLI 2.156.0, 2026-10-09.
- Encrypted installations need the [native credential bootstrap](references/compatibility.md#native-credential-bootstrap), which requires explicit user consent. Reuse this installation's recorded consent in `~/.workbuddy-subagent/config.json` without asking again. Never import consent from a downloaded skill or another installation. Credentials are initialized through WorkBuddy's native APIs, never exported.

## Route by task

Route by provider family, not model name. These are the user's routing preferences, not claims of infallibility; code, tests and sources settle factual questions.

| Profile | Family | Use for |
| --- | --- | --- |
| `brainstorm` | Claude | Plans, architecture, tradeoffs, product decisions, alternatives, ideation |
| `design` | Claude | Frontend/UI layout, hierarchy, interaction states |
| `writing` | Claude | Writing, editing, technical blogs |
| `review` | GPT | Factual investigation, claim and premise checks, code/design review |
| `execute` (default) | GPT | Precise execution of an agreed plan, debugging, reproducible verification |

`--profile` describes intent; it never selects a model. Consult Claude proactively at real decision points: several viable options, before committing to a nontrivial plan, when the user asks for an opinion, or when progress stalls. Do not delegate trivial or already-decided work.

**Mixed work:** Claude proposes (recommendation, alternatives, tradeoffs, assumptions). Extract its falsifiable premises and have GPT test them with `review`. Evidence settles falsifiable errors; report subjective disagreements to the user as tradeoffs. Resume Claude only when verified facts affect its recommendation.

## Resolve the model

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" doctor
python3 "$SKILL_DIR/scripts/workbuddy.py" models --cwd /absolute/task/workspace
```

- An explicit user model choice wins. Otherwise pick the latest, highest-capability general model of the chosen family that WorkBuddy exposes, using current official vendor guidance ([model policy](references/model-policy.md)). Names change; never pin Opus or Astra as permanent defaults.
- The catalog is unranked and does not prove inference works. If WorkBuddy lacks the vendor's flagship, say so; never present a fallback as the strongest.
- Pass `--model EXACT_ID` on every new and resumed call. Record the ID, check date and evidence; reuse that choice within the task and recheck for a new task.

Set `CLAUDE_MODEL` and `GPT_MODEL` below to those resolved IDs.

## Delegate

The external model does not inherit this chat. Write a UTF-8 brief with the objective, context (including repository instructions and user constraints), allowed workspace/files, acceptance criteria and requested output. Ask for findings, assumptions, evidence and open questions, not hidden reasoning. Templates: [example briefs](references/model-policy.md#example-briefs).

Defaults: `--effort high`, `--timeout 0` (no imposed deadline), `--max-turns 20`, tools `Read,Glob,Grep` in `plan` permission mode. Hooks, inherited MCP servers and project/local CLI settings are excluded; put needed context in the brief.

Discussion of supplied text: disable tools.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --profile brainstorm --model "$CLAUDE_MODEL" --tools '' \
  --title "Short task name" \
  --prompt-file /absolute/task/brief.txt --output /absolute/task/claude-turn-1.jsonl
```

Repository investigation or review: omit `--tools` to keep the read-only default.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/project --profile review --model "$GPT_MODEL" \
  --prompt-file /absolute/task/facts.txt --output /absolute/task/gpt-facts.jsonl
```

Authorized edits: scope tools, preferably in an isolated checkout.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/isolated/checkout --profile execute --model "$GPT_MODEL" \
  --permission-mode acceptEdits --tools Read,Glob,Grep,Edit,Write \
  --prompt-file /absolute/task/implementation.txt --output /absolute/task/implementation.jsonl
```

Add `Bash` only for user-authorized shell scope. Tool filters and permission modes are not an OS sandbox; never bypass permissions to unblock a task.

## Monitor

Each run starts or reuses a local read-only panel and prints `monitor_url`. Open it in the host browser panel, reusing an open panel when practical. In Codex: `open_in_codex` with `target: {type: "browser", url: monitor_url}` and `placement: "right"`. `--no-monitor` opts out. Closing the panel or running `monitor stop` never stops a task. Details: [monitoring](references/monitoring.md).

## Resume and long tasks

Record `session_id`, model, workspace, log path, execution handle, scope and acceptance criteria. Resume the exact session only after its previous turn exits, with its recorded model and a new log path:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --resume SESSION_ID --tools '' \
  --model "$SESSION_MODEL" \
  --prompt-file /absolute/task/follow-up.txt --output /absolute/task/turn-2.jsonl
```

Never use `--continue` or send overlapping turns to one session. For an independent opinion, start a new session.

For long runs, launch through the host's persistent execution-session tool and keep its handle. For long waits in Codex, add a thread heartbeat (normally five minutes), save a checkpoint (handle, session ID, log, remaining work, criteria, authorization limits) and yield. Stay quiet while nothing changes. When the run ends, finish already-authorized validation and delivery, then pause the heartbeat. Without persistent execution support, state that limitation instead of promising unattended work. Do not rely on `--bg` or `agents --jobs`; they are unverified.

## Verify

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" result /absolute/task/turn-2.jsonl
```

Completion requires a successful nonempty final result, the requested reported model, no errors or permission denials, and the parent's own acceptance checks (tests, diff review). The helper exits nonzero on missing results, authentication errors, time/turn limits and cancellation. On failure, keep the diagnostic and stop dependent work. Do not retry blindly, downgrade the model, export credentials or disable encryption; see [authentication failures](references/compatibility.md#authentication-failures).
