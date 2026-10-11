---
name: claude-code-subagent
description: Delegate scoped work to native Claude Code background sessions, watch their activity, stop and resume them, and verify the results. Use when Claude Code is requested as a thinking partner or executor, or when an existing delegated Claude Code task needs supervision or recovery.
---

# Claude Code Subagent

Run Claude Code through its installed CLI and native background supervisor. The parent agent supplies context, supervises progress and accepts the work. Closing the browser or parent execution session leaves the native task running.

## Setup and model

Resolve `SKILL_DIR` to this directory. Requires Python 3.9+, a signed-in Claude Code installation with native background agents, and macOS or Linux. Tested with Claude Code 2.1.296 on macOS. Run:

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" doctor
```

Use Claude Code's existing authentication. For a new workspace, accept its native trust dialog in a terminal only after inspecting the workspace; do not edit trust or credential files. Diagnostics and compatibility: [native sessions](references/native-sessions.md).

An explicit user model wins. Otherwise resolve the latest, strongest Claude model available through the user's provider using current [vendor guidance](https://platform.claude.com/docs/en/models/overview). Pass the provider's exact model ID and check `reported_model`; an alias or official API spelling may map differently through a gateway. Never silently downgrade. Default effort is `high`; there is no imposed task deadline or turn cap.

## Brief and run

The external conversation does not inherit this chat. Write a self-contained brief with the goal, evidence, user constraints, repository instructions, allowed paths and tools, acceptance criteria, and the parent-owned validation and delivery. Prefer an isolated workspace for edits. Keep briefs, logs and checkpoints in durable private storage outside repositories and temporary directories.

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" run \
  --cwd /absolute/workspace --model "$MODEL_ID" \
  --title "Short task name" --prompt-file /absolute/task/brief.md
```

Defaults are read-only tools `Read,Glob,Grep` in `plan` mode. For discussion of supplied text, use `--tools ''`. For authorized edits, use `--permission-mode acceptEdits --tools Read,Glob,Grep,Edit,Write`. Add `Bash` when shell work is in scope and use `--allowed-tools` for the specific commands authorized to run unattended. Available tools and permission grants are separate; a tool list is not a filesystem sandbox.

The helper supplies a session-local observation hook, disables automatic memory updates and inherited MCP servers, and asks Claude Code to stop child work with the session. Other native instructions, settings and customizations can still apply. Do not give a delegated session permission to change unrelated settings or memory. Native background agents may create a worktree when editing a Git repository; inspect the actual changed checkout rather than assuming edits land in the launch directory.

The command returns immediately with a managed task `id`, native `job_id`, conversation `session_id` and `monitor_url`. Save these identifiers and the workspace, model, scope and remaining steps. Native state lives in Claude Code; the helper's private records and public logs live under `~/.claude-code-subagent`. `--state-dir` selects a different private registry.

## Observe and supervise

Open `monitor_url` in the host browser panel. In Codex, use `open_in_codex` with a browser target and right placement. The reused panel supports sanitized Markdown, tool results, edit previews, English/Chinese, and System/light/dark preferences. Replies appear when native transcript blocks are saved, not token by token. Stop and resume controls operate on the selected turn.

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" status TASK_ID
python3 "$SKILL_DIR/scripts/claude_code.py" logs TASK_ID
python3 "$SKILL_DIR/scripts/claude_code.py" list
```

`logs` returns a public projection; hidden thinking and raw native metadata are excluded. For native questions or permission dialogs, run `claude_code.py attach TASK_ID` in an interactive terminal. The panel displays its equivalent native attach command. Browser replies do not approve permission dialogs.

The native supervisor owns execution; the panel is an observer and explicit controller. For a long wait in Codex, reuse or create a heartbeat on the current task, normally every five minutes, pointed at a durable checkpoint. Check public output, native state, tool activity and files against acceptance criteria. Let useful work continue; intervene for repetition, failures, scope drift or user direction. Quiet generation alone is not a failure. Keep unchanged checks quiet. Finish authorized validation and delivery after model completion, then pause and verify this task's heartbeat.

## Stop and resume

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" stop TASK_ID
python3 "$SKILL_DIR/scripts/claude_code.py" resume TASK_ID \
  --prompt-file /absolute/task/follow-up.md
```

Stop confirms the native task has stopped or already ended. Inspect retained edits and child-process side effects before recovery; stopping does not roll back files. Resume the latest managed turn. It uses the recorded conversation, model, effort, tool list and permissions, and writes a new turn log. Never resume while the native job is working, waiting for input, absent from inventory, or already has an unfinished managed follow-up.

Claude Code can resume into a copy with a new UUID. The helper records `resume_source`, displays the identity change, and groups the related turns under one `conversation_id`. Verify retained context and the reported model before accepting the resumed result. Use a new `run` for an independent opinion.

Browser/server restarts do not restart tasks. Reopen the panel with `claude_code.py monitor`; it reconnects to native inventory and continues collecting logs. After a machine restart, reconcile the native state and saved transcript before explicitly resuming. Recovery details: [native sessions](references/native-sessions.md#recovery).

## Accept the result

```bash
python3 "$SKILL_DIR/scripts/claude_code.py" result TASK_ID
```

A zero exit means the native turn ended with a nonempty public reply from the requested model and no recorded tool errors. It does not prove the task is correct. Review actual tool calls, file scope, permissions, changes and repository checks; report only validation actually performed. Keep failed/interrupted logs and edits. Diagnose authentication, missing models and blocked permissions through native interfaces rather than exporting credentials, widening scope or blindly repeating the task.
