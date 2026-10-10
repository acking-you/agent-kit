# Live monitoring

Each `run` starts or reuses a local read-only dashboard and prints `monitor_url` with the session ID and log path. The helper enables `--include-partial-messages`, persists each JSONL line immediately and records the run's final validation status. Without `--output`, it creates a private log under `~/.workbuddy-subagent/monitor/runs`. The helper never opens a browser itself; the parent opens the URL in the host panel.

## Display

- Sessions by native session ID, with a turn selector for resumes; requested model, workspace, title, elapsed time and status.
- Public reply text as it streams, tool arguments and results, and Edit/Write change previews. A preview is a request; only a successful tool result marks it applied.
- A sanitized activity phase and last-event age, including while the model is thinking. Hidden thinking text and authentication metadata are never shown.
- Distinct states for failed validation, interrupted runners and disconnected monitoring. "Completed" means the CLI result passed validation, not that the task was accepted.

The browser reconnects automatically and rebuilds its view from persisted logs; a refresh keeps the selected turn. Public replies and final responses render Markdown, including lists, fenced code, tables and links. Raw HTML stays literal, unsafe links are disabled, and images become links without automatic requests. Tool arguments and results stay literal. Fields are capped at 60,000 characters with a truncation note; the JSONL log stays complete. Tool content can still contain private data.

Markdown uses locally bundled Marked and DOMPurify; versions, hashes and licenses are in `assets/monitor/vendor/NOTICE.txt`. Nothing is fetched or installed at runtime.

Language (System / English / Chinese) and theme (System / Light / Dark) default to System and follow browser language or OS color-scheme changes live. Manual choices persist in browser storage for the same origin (host and port), so a server restart on a new port resets them. UI labels are translated; task content stays in its original text.

## Commands and storage

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor start
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor status
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor stop
```

These manage only the observer; `monitor stop` never stops, resumes or instructs a task. No browser endpoint can mutate tasks, invoke models or read arbitrary paths.

- State directory: `~/.workbuddy-subagent/monitor`. Override it with `WORKBUDDY_MONITOR_DIR` consistently for runs and monitor commands, or with `--state-dir` on monitor commands.
- Logs and run records are never deleted automatically, but an explicit log in an OS temporary or build directory can disappear when that directory is cleaned; the run record stores its path, not a copy. Pre-monitoring logs are not imported.
- The server binds `127.0.0.1` on a free port, checks Host/Origin, requires an unguessable path token, uses no external assets and disables access logs. Keep the URL private and never forward the port. This isolates other browser origins, not other software running as the same OS user.
- It starts on demand and exits after 30 minutes with no requests and no active runs. A restart changes the port and URL; reopen the newly returned URL.

## Recovery

- If monitor startup fails, no task is launched; run `monitor serve` in the foreground for diagnostics.
- A disconnected panel is not a reason to rerun the model. Run `monitor start`, then check the saved log with `result LOG --model EXACT_ID` using the session's recorded model.
- The panel marks a run interrupted when its runner is missing or its heartbeat is stale. That is an observation, not an exit code; confirm the execution state and inspect workspace side effects before resuming.
- After changing observer scripts or assets, run `monitor stop` and `monitor start`, then reopen the URL. Documentation changes need no restart.

## Interruption recovery

A host execution handle may disappear after a restart while source edits and the native WorkBuddy session survive. Conversely, a stale `running` record does not prove a live process.

1. Read the latest checkpoint, then inspect the execution handle, saved run record and process identity. A missing handle or quiet log alone does not justify another run. Confirm the old runner is gone before resuming, without killing an unrelated process that reused its PID.
2. Preserve the prior log and diagnostics and inspect workspace changes. If the task log is missing, recover public messages, tool outcomes and session identity only from the matching native session's history in this installation's storage; do not scan unrelated conversations, credentials or hidden reasoning. If that history is unavailable, record the gap and reconcile the surviving source with the last verified checkpoint.
3. Run `result LOG --model EXACT_ID` when a complete stream log exists. Native history or partial edits are recovery evidence, not a successful result; without a verifiable final result, record the turn as interrupted and keep its changes pending review.
4. Resume the original session with its recorded model, a fresh durable log and a corrected brief stating what was verified, what may already have been applied and which acceptance steps remain. Ask it to read current files before editing; never replay mutations just because their log is missing. If the session cannot be resumed, diagnose why before starting a replacement, carrying forward only verified state and disclosing the history gap.
5. Check the resumed session's reported model and actual tool activity. Point the checkpoint and existing heartbeat at the new handle and log. Reuse earlier verification only where the checked source is unchanged, then finish the remaining validation and delivery.

Keep the checkpoint to one current next-action list that separates active jobs, completed jobs, interrupted turns and unvalidated changes, and archive superseded details elsewhere, so a later heartbeat cannot restart a finished job or present an old test run as final acceptance. Do not publish these records or their monitor URLs.
