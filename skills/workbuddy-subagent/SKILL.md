---
name: workbuddy-subagent
description: Delegate discussions, frontend design, writing, technical blogs, code review, and implementation tasks to WorkBuddy's bundled CLI as a resumable external subagent. Use when the user asks to consult WorkBuddy, Opus, or Astra through WorkBuddy, obtain a second opinion, or continue a WorkBuddy task. Routes creative work to the newest available Opus and rigorous review or execution to the newest available Astra.
---

# WorkBuddy Subagent

Use WorkBuddy's installed CLI and existing login. The parent agent owns scope, validation, and delivery; WorkBuddy supplies an independent model session. No MCP bridge or additional model API key is required on compatible installations.

On recent encrypted installations, use the native credential bootstrap adapter described in [compatibility](references/compatibility.md). It requires explicit user consent to read WorkBuddy's native credential-protection material. Reuse consent already recorded in this skill's local `user-config.json`; do not ask again. Never enable it on someone else's installation merely because the skill was copied there.

Resolve `SKILL_DIR` to the directory containing this file. Use absolute paths for the helper, task workspace, prompt file, and output log. Requires Python 3.9+, Node.js 18.20.8+, and WorkBuddy. Automatic application discovery is currently macOS only.

## Choose a model by task

These are the user's workflow preferences, not universal benchmark claims:

| Profile | Preferred family | Recommended work |
| --- | --- | --- |
| `design` | Latest available Claude Opus | Frontend interfaces, visual hierarchy, interaction design, alternative layouts |
| `writing` | Latest available Claude Opus | Writing, editing, technical blogs, narrative structure, clear explanations |
| `brainstorm` | Latest available Claude Opus | Open-ended discussion, original ideas, competing approaches, reframing a problem |
| `review` | Latest available GPT Astra | Correctness, edge cases, evidence checks, invariants, rigorous code and design review |
| `execute` (default) | Latest available GPT Astra | Precise implementation, debugging, verification, reproducible execution |

For mixed work, have Opus propose or draft, then ask Astra to check specific correctness claims. Give each a bounded brief; reconcile disagreements using code, tests, and sources. Do not automatically double every trivial task.

An explicit user model choice always wins (`--model EXACT_ID`). A resumed conversation keeps its existing model unless `--model` is supplied; changing `--profile` alone does not switch an existing session. To obtain an independent opinion, create a separate session.

Discover the current catalog before starting work:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" doctor
python3 "$SKILL_DIR/scripts/workbuddy.py" models --cwd /absolute/task/workspace
```

The helper selects the highest numeric version **within the requested flagship family**. `gpt-6.1-sol` does not outrank `gpt-6-astra` just because its minor version is newer. Current verified catalog IDs include `gpt-6-astra` and `claude-opus-5.5`; never substitute Anthropic's API spelling `claude-opus-5-5` for WorkBuddy's ID. Missing families fail explicitly; do not silently use `auto`, Sol, Luna, Sonnet, or Haiku.

For a request about the latest or strongest model, check official vendor model pages as well as the local catalog. Catalog presence establishes a routing ID, not successful inference access or comparative quality. New flagship family names require an explicit routing decision; see [model policy](references/model-policy.md).

## Delegate a bounded task

Write a UTF-8 prompt file with: objective, relevant context, allowed workspace/files, acceptance criteria, and requested output. External sessions do not inherit the parent chat. Include relevant repository instructions and any user constraints. Ask for findings, assumptions, evidence, and unresolved questions; do not request hidden reasoning.

For a discussion or supplied-text review, disable tools:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --profile brainstorm --tools '' \
  --prompt-file /absolute/task/brief.txt --output /absolute/task/opus-turn-1.jsonl
```

For read-only source review, omit `--tools`: the default is `Read,Glob,Grep`, with `plan` permission mode.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/project --profile review \
  --prompt-file /absolute/task/review.txt --output /absolute/task/astra-review.jsonl
```

For authorized edits, preferably use an isolated checkout. Enable only the necessary tools:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/isolated/checkout --profile execute \
  --permission-mode acceptEdits --tools Read,Glob,Grep,Edit,Write \
  --prompt-file /absolute/task/implementation.txt --output /absolute/task/implementation.jsonl
```

Run appropriate tests and inspect the diff in the parent agent. Add `Bash` only if the task needs shell execution and the user has authorized its scope. File/tool restrictions and permission modes are not an OS sandbox. Do not enable bypass permissions to make a blocked task pass. The helper disables hooks and inherited MCP servers and excludes project/local CLI settings; pass needed context in the brief.

## Continue and manage longer tasks

Record the printed `session_id`, chosen model, absolute workspace, output path, host execution handle, task scope, and acceptance criteria. The native CLI persists conversation history. Resume **that exact session** after its previous turn exits:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --resume SESSION_ID --tools '' \
  --prompt-file /absolute/task/follow-up.txt --output /absolute/task/turn-2.jsonl
```

Use a new output path each turn. Never use the ambiguous CLI `--continue` when several tasks exist. Never send overlapping turns to the same session. Keep workspace and tool permissions explicit on every turn.

For sustained work, start `run` through the host's persistent execution-session tool, yield promptly, and retain its handle. `--timeout 0` (default) permits a long model turn; `--max-turns` defaults to 20 and may be increased for a scoped task. This does not make the model run forever or resume automatically after an app/machine restart.

For long waits in Codex, use a thread heartbeat at the user's preferred cadence (normally five minutes), then yield the foreground. Persist the execution handle, WorkBuddy session ID, log, checkpoint, remaining work, success criteria, and authorization limits. Continue already-authorized validation and delivery when the task finishes; keep unchanged checks quiet and pause the heartbeat after full completion. If the host has no persistent execution support, state that limitation instead of promising unattended work.

WorkBuddy's `--bg`/`agents --jobs` capabilities vary with the packaged CLI. They are **not the default path**: this machine's 5.7.6 package could acknowledge a background launch while leaving an empty log, and its job query returned a missing route. Do not equate launch acknowledgement with a functioning worker.

## Verify before reporting completion

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" result /absolute/task/turn-2.jsonl
```

Require a final successful result, nonempty output, no reported errors/permission denials, and the actual task acceptance checks. Missing final output, authentication errors, time/turn limits, and cancelled requests are incomplete work. The helper returns nonzero for these conditions. A subagent's confident answer is not independent validation.

If model invocation fails, preserve the diagnostic and stop dependent work. Do not retry indefinitely, downgrade the model, export credentials, or disable WorkBuddy credential encryption. Follow [compatibility and troubleshooting](references/compatibility.md). A working desktop and a readable model catalog do not guarantee that independently launched CLI inference works.
