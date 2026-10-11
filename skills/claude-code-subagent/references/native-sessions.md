# Native sessions and recovery

## Interface and compatibility

Validated on macOS with Claude Code 2.1.296 on 2026-10-11. The runtime uses Python's standard library; the vendored monitor is adapted from the WorkBuddy panel and includes its Markdown renderer licenses. Install the whole skill directory.

Supported native interfaces:

- `claude --bg`: dispatch without tying execution to the caller's terminal.
- `claude agents --json --all`: read native job state, including completed jobs.
- `claude stop JOB_ID`: stop a background session and keep its conversation.
- `claude --resume SESSION_UUID --bg`: continue a saved conversation.
- `claude attach JOB_ID`: enter the interactive session to view live terminal output or answer native dialogs.
- A session-local `SessionStart` command hook supplies `session_id` and `transcript_path` to the observer.

`--bg` cannot be combined with `-p` or structured print output. The observer reads saved transcript envelopes and projects only public message/tool blocks. It does not scrape the terminal or depend on Claude Code's private job-state files. The native transcript format may change: if the hook or current turn is missing, treat it as a recovery problem rather than successful completion.

Sources: [agent view](https://code.claude.com/docs/en/agent-view), [CLI reference](https://code.claude.com/docs/en/cli-reference), [hooks](https://code.claude.com/docs/en/hooks).

The tested provider accepted `claude-opus-5.5` and reported that ID. Its official API spelling `claude-opus-5-5` and the `opus` alias were rejected by the gateway. This is a dated installation observation, not a permanent default or a reason to replace another provider's IDs.

## Permissions and persistence

Authentication and workspace trust belong to Claude Code. The helper does not read tokens, use `--bare`, replace Claude Code's config directory, or mutate global settings. Native background workers reuse the installation's login. An untrusted workspace needs the native trust dialog completed in a terminal; the wrapper fails rather than modifying trust behind the user's back.

The helper stores each brief, session-local hook settings, dispatch receipt and public turn log under a private registry. A dispatch acknowledgement is saved before inventory queries; a temporary query failure remains observable and recoverable. Unconfirmed dispatches are reconciled by the unique native job name, without reissuing the prompt. Definitively undispatched attempts do not become conversation turns. Records are atomically replaced and mutations are serialized with a filesystem lock. The native supervisor runs separately from the local HTTP panel. Closing or restarting the panel changes no task execution state; restarting a machine ends running processes while preserving saved conversations.

The panel binds to loopback and uses a capability URL. State-changing requests require a same-origin JSON POST with the correct Host and capability. It does not expose a general shell endpoint or accept arbitrary filesystem paths. Public text is rendered with the same sanitized Markdown layer as WorkBuddy. Tool content remains literal text; hidden thinking is not copied to its logs or browser.

## Recovery

1. Read the managed record and `claude agents --json --all`. Missing inventory or a missing host handle is not proof of completion. A blocked task needs its native question/dialog handled; it is not a candidate for another overlapping turn.
2. If work must stop, use the recorded job ID through `stop`. Verify it is no longer busy and inspect files and child work before resuming. The session-local setting disables native background exit handoff so a stop does not intentionally leave delegated child work running.
3. Resume from the latest managed turn with a fresh brief. The helper retains the selected model/effort and permissions, writes a new log, and records the source UUID. The native CLI may create a copy: the resulting UUID is recorded rather than assumed to equal the source.
4. Check the resumed public output and artifacts for the expected context. Terminal logs settle before acceptance and are reconciled again if the native transcript grows. A native `done` state ends a turn; it does not settle acceptance or complete parent delivery.
5. If the panel is unavailable, `status`, `logs` and `result` collect directly from the durable native transcript. `monitor` starts a fresh observer without reissuing the model prompt.

For an update that removes an old CLI binary, keep records/logs, run `doctor`, and reconcile the native task with the current executable before changing its recorded executable. Do not use `respawn --all`, stop the shared native daemon, or remove unrelated jobs to recover one delegated task.
