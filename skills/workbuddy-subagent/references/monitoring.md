# Live monitoring

Each `run` starts or reuses a local read-only dashboard and prints `monitor_url` with the session ID and log path. The helper enables `--include-partial-messages`, persists each JSONL line immediately and records its final validation status. Without `--output`, it creates a private log under `~/.workbuddy-subagent/monitor/runs`. The helper never opens a browser itself; the parent opens the URL in the host panel.

## Display

- Sessions by native session ID, with a turn selector for resumes; requested model, workspace, title, elapsed time and status.
- Public reply text as it streams, tool arguments/results, and Edit/Write change previews. A preview is a request; only a successful tool result marks it applied.
- A sanitized activity phase and last-event age, including while the model is thinking. Hidden thinking text and authentication metadata are never shown.
- Distinct states for failed validation, interrupted runners and disconnected monitoring. "Completed" means the CLI result passed validation, not task acceptance.

The browser reconnects automatically and rebuilds its view from persisted logs; a refresh keeps the selected turn. Public replies and final responses render Markdown, including lists, fenced code, tables and links. Raw HTML remains literal, unsafe links are disabled, and images become links without automatic requests. Tool arguments/results stay literal. Fields are capped at 60,000 characters with a truncation note; the JSONL log stays complete. Tool content can still contain private data.

Markdown uses locally bundled Marked and DOMPurify; versions, hashes and licenses are in `assets/monitor/vendor/NOTICE.txt`. No CDN or package installation is needed at runtime.

Language (System / English / Chinese) and theme (System / Light / Dark) both default to System and follow browser language or OS color-scheme changes live. Manual choices persist in browser storage for the same origin (host and port), so a server restart on a new port resets them. UI labels are translated; task content and skill documentation stay in their original text.

## Commands and storage

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor start
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor status
python3 "$SKILL_DIR/scripts/workbuddy.py" monitor stop
```

These manage only the observer; `monitor stop` never stops, resumes or instructs a task. No browser endpoint can mutate tasks, invoke models or read arbitrary paths.

- State directory: `~/.workbuddy-subagent/monitor`. Override with `WORKBUDDY_MONITOR_DIR` consistently for runs and monitor commands, or `--state-dir` on monitor commands.
- The helper does not automatically delete logs or run records. An explicit log in an OS temporary or build directory can still disappear when that directory is cleaned; the run record stores its path, not a backup. Prefer durable private storage. Pre-monitoring logs are not imported.
- The server binds `127.0.0.1` on a free port, checks Host/Origin, requires an unguessable path token, uses no external assets and disables access logs. Keep the URL private and never forward the port. This isolates other browser origins, not other software running as the same OS user.
- It starts on demand and exits after 30 minutes with no requests and no active runs. A restart changes the port and URL; reopen the newly returned URL.

## Recovery

- If monitor startup fails, no task is launched; run `monitor serve` in the foreground for diagnostics.
- A disconnected panel is not a reason to rerun the model. Run `monitor start`, then check the saved log with `result LOG --model EXACT_ID`, using the session's recorded model.
- The panel treats a missing runner or stale heartbeat as interrupted. That observation is not an exit code; confirm execution state and inspect workspace side effects before resuming.
- After changing observer runtime or assets, restart the observer with `monitor stop` and `monitor start`, then reopen the URL. Documentation-only changes do not require a restart.

## Interruption recovery

A host execution handle may disappear after a restart even though source edits and the native WorkBuddy session survive. A stale `running` record is not proof of a live process either.

1. Read the latest durable checkpoint. Inspect the execution handle, saved run record and relevant process identity. A missing handle or quiet log alone does not justify another run. Confirm the old runner is gone before resuming; do not kill an unrelated process that reused its PID.
2. Preserve the prior log and diagnostics if present, and inspect workspace changes. If the task log is missing, use only the matching native session's persisted history to recover public messages, tool outcomes and session identity. Locate it through this installation's actual storage; do not scan unrelated conversations, credentials or hidden reasoning. If native history is unavailable, record that uncertainty and reconcile the surviving source with the last verified checkpoint.
3. Run `result LOG --model EXACT_ID` when a complete stream log is available. Native history or partial edits are recovery evidence, not a fabricated successful result. If no verifiable final result survives, record the turn as interrupted/incomplete and keep its changes pending review.
4. Resume the original session with its recorded exact model, a fresh durable log and a corrected brief. State what was verified, what may already have been applied, and which acceptance steps remain. Require reading current files before further edits; never replay mutations just because their old log is missing. If the session cannot be resumed, diagnose that failure before starting a replacement; carry forward only verified state and disclose the history gap.
5. Verify the resumed init session/model/mode and actual tool activity. Update the checkpoint and the existing heartbeat to the new handle and log. Reuse prior verification only where the checked source is still current; finish the remaining validation and delivery.

The checkpoint should distinguish active jobs, completed jobs, interrupted turns and unvalidated source changes. Keep one current next-action list and archive superseded details separately, so a later heartbeat cannot restart an already completed job or present an earlier test run as final acceptance. Do not publish these operational records or their private monitor URLs.
