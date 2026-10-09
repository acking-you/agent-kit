# Live monitoring

Every `run` starts or reuses an independent local dashboard and prints `monitor_url` alongside its session ID and log path. Set `--title` to a short task label. The helper enables native `--include-partial-messages`, persists each JSONL line immediately and records the runner's final validation status. Without `--output`, it creates a private log automatically.

Open the returned URL in the host's browser panel. In Codex, use `open_in_codex` with target type `browser`, the returned URL and placement `right`. Reuse the existing panel when practical. Opening the page is part of the skill's default workflow; `--no-monitor` opts out. The Python helper does not depend on Codex-specific UI APIs or open a system browser itself.

## What the panel shows

- Sessions grouped by native session ID, with a turn selector for explicit resumes.
- Requested model, workspace, task title, elapsed time and runner status.
- Public reply text as it arrives, merged with the final message without duplication.
- Expandable tool arguments and results, plus Edit/Write change previews. A preview is a tool request; only a successful tool result marks it as applied. Parent acceptance tests are still required.
- Filters for replies, tools and changes, and a follow-output toggle. Scrolling upward with the wheel or keyboard pauses following.
- Failed validation, interrupted runners and disconnected monitoring as distinct states.
- A sanitized activity phase and last-event age, including when the model is thinking without publishing a new reply or tool call. Thinking content remains private.

Text is displayed literally; Markdown and HTML are not executed. Thinking blocks and internal authentication metadata are excluded from the browser projection. Tool arguments and results can still contain private task data. Individual displayed fields are capped at 60,000 characters with an explicit truncation note; the private JSONL log remains the complete source.

The browser reconnects automatically while the server remains available. Each connection reconstructs a fresh snapshot from complete persisted JSONL lines, then sends updates over SSE. The browser replaces its snapshot on reconnect, so it does not rely on a lossy in-memory event backlog. Refreshing restores the selected turn from the URL fragment. Restarting the server changes its port and private URL; reopen the URL returned by `monitor start`.

## Language and appearance

Use the panel's language and appearance selectors to choose System / English / Simplified Chinese and System / Light / Dark. Both default to System. Language uses the browser's preferred languages (Chinese and English are supported; English is the fallback). Theme follows the operating system's color-scheme preference. While System is selected, changes to browser language or system theme are applied without reloading.

Manual choices take precedence and are saved in local browser storage. Switching either setting preserves the selected turn, transcript, filters, expanded tools and scroll position. UI labels are translated; task titles, model IDs, paths, assistant replies, tool content and raw diagnostics retain their original text. Skill instructions and developer documentation remain in English.

Browser storage is origin-bound: saved choices survive page reloads on the same host and port, but a server restart on a different port starts with System defaults. If storage is disabled or contains invalid values, the panel safely uses System defaults.

## Commands and storage

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor start
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor status
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor stop
```

`monitor stop` stops only the observer. It does not stop, resume or send instructions to model tasks. Starting it again restores saved runs. No browser endpoint can mutate tasks, invoke models, or read an arbitrary path.

Default state directory: `~/.workbuddy-subagent/monitor`. Override `WORKBUDDY_MONITOR_DIR` consistently for task launches and monitor commands; monitor commands also accept `--state-dir`. This directory holds private run records, automatic logs and the current server descriptor. Supplied output logs stay at their chosen paths. Existing logs from before monitoring was enabled are not imported automatically. There is no automatic deletion of transcripts; remove obsolete logs and their matching run records locally when no longer needed.

The server uses only Python's standard library, binds to `127.0.0.1` on an available port, checks Host/Origin, and requires an unguessable path token. It serves bundled local assets, has no external analytics/CDN dependencies, and disables access logging. Keep the URL private and do not forward or expose the port. State directories are created with mode `0700`, records/logs with `0600`. This is isolation from other browser origins, not protection from software already running as the same OS user.

The observer is launched on demand, survives closing the browser or a model turn, and exits after 30 minutes with no requests and no active runs. It is not installed as a login item or OS service. A machine restart requires a fresh `monitor start` or task launch. An observer crash does not stop WorkBuddy; a stale/dead task runner is marked interrupted rather than successful. Inspect workspace side effects before resuming any interrupted task.

## Troubleshooting

If startup fails, no model task is launched. Use `monitor serve` in the foreground to see startup diagnostics. Do not retry the model merely because its panel disconnects: recover monitoring with `monitor start`, then inspect the saved session and `result` output. If an old observer process is still serving files after updating this skill, run `monitor stop` and `monitor start`, then reopen the new URL.

The dashboard observes logs and runner records. It does not add scheduling, autonomous retries, task cancellation, mid-turn instructions, permission approval, or a native Codex subagent registration.
