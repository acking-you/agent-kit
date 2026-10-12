---
name: claude-code-subagent
description: Delegate scoped work to native Claude Code background sessions, watch their activity, stop and resume them, and verify the results. Use when Claude Code is requested as a thinking partner or executor, or when an existing delegated Claude Code task needs supervision or recovery.
---

# Claude Code Subagent

Run Claude Code as a native background session. You write the brief, supervise, and accept the result; Claude Code executes. The task keeps running if the browser or your own session closes.

## Setup

Resolve `SKILL_DIR` to this directory. Requires Python 3.9+, macOS or Linux, and a signed-in Claude Code with background agents. Check with:

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" doctor
```

Claude Code keeps its own login and workspace trust. If a new workspace needs trust, inspect it, then accept the native dialog in a terminal. Never edit trust, credential or global settings files. Details: [native sessions](references/native-sessions.md).

## Model and effort

An explicit user choice wins. Otherwise use the latest, strongest Claude model available through the user's provider, checked against current [vendor guidance](https://platform.claude.com/docs/en/models/overview). Pass the provider's exact model ID and confirm `reported_model` matches; gateways may map aliases differently. Never silently downgrade. Effort defaults to `high`. Do not impose a turn cap or deadline.

## Brief and run

The session does not see this chat. Write a self-contained brief: goal, evidence, user constraints, repository instructions, scope (paths and actions in bounds), acceptance criteria, and which validation and delivery steps you keep. Prefer an isolated workspace for edits. Store briefs and checkpoints outside repositories and temporary directories.

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" run \
  --cwd /absolute/workspace --model "$MODEL_ID" \
  --title "Short task name" --prompt-file /absolute/task/brief.md
```

By default the session has every built-in tool and runs with `bypassPermissions`, so tool approvals do not stall background work. This gives it autonomy within the task, not a sandbox: the brief defines scope. Pass a narrower `--tools` or `--permission-mode` only when the user asks for one.

The command returns immediately with a managed `id`, native `job_id`, `session_id` and `monitor_url`. Record them with the workspace, model and remaining steps. Records and public logs live under `~/.claude-code-subagent` (`--state-dir` overrides). In a Git repository, Claude Code may edit in its own worktree; inspect where changes actually landed.

## Supervise

Open `monitor_url` in the host's browser panel (in Codex, `open_in_codex` with a browser target, right placement). It shows each turn's expandable, copyable user input, replies, tool calls, edit previews and stop/resume controls. Input comes from the native transcript; a saved dispatch prompt is explicitly labelled when transcript input is unavailable. Replies arrive as Claude saves message blocks, not token by token.

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" status TASK_ID
python3 "$SKILL_DIR/scripts/claude_code.py" logs TASK_ID
python3 "$SKILL_DIR/scripts/claude_code.py" list
```

Watch progress against the acceptance criteria. Let useful work continue; quiet generation is not failure. Steer, stop or resume when there is repetition, failure, scope drift or new user direction. For long waits in Codex, keep one heartbeat on the current task (about every five minutes) pointed at a durable checkpoint and stay quiet when nothing changed. Complete authorized validation and delivery after the turn ends, then pause and verify the heartbeat.

Login problems or genuine clarification questions can still leave a session waiting for input. Answer them with `claude_code.py attach TASK_ID` in an interactive terminal; browser text does not answer native prompts.

## Stop and resume

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" stop TASK_ID
python3 "$SKILL_DIR/scripts/claude_code.py" resume TASK_ID --prompt-file /absolute/task/follow-up.md
```

Stop waits until the native job confirms it has ended. It does not roll back files, so inspect edits before continuing. Resume the latest turn only after it has ended and settled; never overlap turns. A resume keeps the recorded model, effort, tools and permissions unless you pass `--permission-mode` or `--tools`. Claude Code may continue under a new session UUID; the helper records the source, so verify retained context. Start a fresh `run` for an independent opinion. Recovery steps: [native sessions](references/native-sessions.md#recovery).

## Accept

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" result TASK_ID
```

Exit 0 means the turn ended with a public reply from the requested model and no recorded tool errors. It does not prove the work is right. Review the actual tool calls, changed files and scope, run the checks yourself, and report only validation you performed. Keep logs and edits from failed or interrupted turns. Diagnose login, model and waiting problems through Claude Code, not by exporting credentials or blindly repeating the task.
