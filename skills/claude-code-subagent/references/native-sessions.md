# Native sessions and recovery

## Interface and compatibility

Validated on macOS with Claude Code 2.1.296 on 2026-10-11. The runtime uses only Python's standard library. The monitor is adapted from the WorkBuddy panel and bundles its Markdown renderer licenses, so install the whole skill directory.

Native interfaces used:

- `claude --bg`: dispatch without tying execution to the caller's terminal.
- `claude agents --json --all`: read native job state, including completed jobs.
- `claude stop JOB_ID`: stop a background session and keep its conversation.
- `claude --resume SESSION_UUID --bg`: continue a saved conversation.
- `claude attach JOB_ID`: join the interactive session to watch live output or answer native prompts.
- A session-local `SessionStart` command hook gives the observer `session_id` and `transcript_path`.

`--bg` cannot be combined with `-p` or structured print output. The observer reads saved transcript envelopes and projects only public message and tool blocks. It does not scrape the terminal or read Claude Code's private job-state files. The transcript format may change; if the hook or current turn is missing, treat it as a recovery problem, not a completion.

Sources: [agent view](https://code.claude.com/docs/en/agent-view), [CLI reference](https://code.claude.com/docs/en/cli-reference), [hooks](https://code.claude.com/docs/en/hooks).

Model IDs are provider-specific. The tested gateway accepted and reported `claude-opus-5.5`, but rejected the official API spelling `claude-opus-5-5` and the `opus` alias. This is a dated observation, not a default to copy to other providers.

## Tools and permissions

`run` defaults to `--tools default` (every built-in tool) and `--permission-mode bypassPermissions`, which adds `--dangerously-skip-permissions`. Native tool approval prompts therefore do not block background work. This is execution autonomy for the authorized task, not a filesystem sandbox and not wider scope: the brief still sets what is in bounds.

Narrower settings stay available when the user asks for them: `--tools Read,Glob,Grep` or `--tools ''`, `--permission-mode plan|acceptEdits|dontAsk|manual|auto`, and `--allowed-tools` for specific unattended commands. A resume keeps the recorded tools and permissions. Pass `resume --permission-mode` or `--tools` to change them, for example to upgrade a task launched before these defaults. Browser resume always keeps the selected turn's settings.

A session can still wait for input, for example to sign in again or to ask a genuine clarification. Its native state then shows as blocked and the monitor shows the attach command.

The helper also disables automatic memory updates and inherited MCP servers for the session, and asks Claude Code to stop child work when the session stops. Other native instructions, settings and customizations still apply. Do not let a delegated task change unrelated settings, memory or credentials.

## Persistence and the panel

Authentication and workspace trust belong to Claude Code. The helper does not read tokens, use `--bare`, replace Claude Code's config directory, or change global settings. Background workers reuse the existing login. An untrusted workspace needs the native trust dialog accepted in a terminal; the helper fails rather than changing trust itself.

Each brief, session-local hook settings, dispatch receipt and public turn log is stored in a private registry. The dispatch receipt is saved before inventory is queried, so a transient query failure stays observable and recoverable. Unconfirmed dispatches are reconciled by their unique native job name without resending the prompt. Attempts that definitely never dispatched do not become conversation turns. Records are replaced atomically and mutations take a filesystem lock.

The native supervisor runs separately from the local panel. Closing or restarting the panel changes nothing about execution. The private registry retains the panel's port and capability, so a normal observer restart keeps the URL and browser preferences. If another process occupies that port, the observer chooses a new one; reopen the URL returned by `monitor`. A machine restart ends running processes but keeps saved conversations.

The panel binds to loopback behind a capability URL. State changes require a same-origin JSON POST with the correct Host and capability. There is no general shell endpoint and no arbitrary path access. Replies render through the same sanitized Markdown layer as WorkBuddy; tool content stays literal text; hidden thinking never reaches logs or the browser.

## Recovery

1. Read the managed record and `claude agents --json --all`. Missing inventory or a missing host handle does not prove completion. A blocked task needs its native prompt answered, not another overlapping turn.
2. To stop work, use `stop` with the recorded job ID. Confirm the job is no longer busy and inspect files and child processes before resuming. The session-local setting disables native background exit handoff, so a stop does not intentionally leave delegated child work running.
3. Resume from the latest managed turn with a fresh brief. The helper keeps the model, effort, tools and permissions, writes a new log, and records the source UUID. Claude Code may create a copy; the helper records the actual resulting UUID rather than assuming it matches.
4. Check the resumed output and artifacts for the expected context. Terminal logs settle before acceptance and are reconciled again if the transcript grows. A native `done` state ends a turn; it does not accept the work or finish delivery.
5. If the panel is unavailable, `status`, `logs` and `result` read directly from the durable transcript. `monitor` starts a fresh observer without resending the prompt.

After a CLI update removes an old binary, keep the records and logs, run `doctor`, and reconcile the task with the current executable before changing its recorded path. Do not use `respawn --all`, stop the shared native daemon, or remove unrelated jobs to recover one task.
