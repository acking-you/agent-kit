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
- Logs and run records are retained; nothing is deleted automatically. Remove obsolete ones manually. Pre-monitoring logs are not imported.
- The server binds `127.0.0.1` on a free port, checks Host/Origin, requires an unguessable path token, uses no external assets and disables access logs. Keep the URL private and never forward the port. This isolates other browser origins, not other software running as the same OS user.
- It starts on demand and exits after 30 minutes with no requests and no active runs. A restart changes the port and URL; reopen the newly returned URL.

## Recovery

- If monitor startup fails, no task is launched; run `monitor serve` in the foreground for diagnostics.
- A disconnected panel is not a reason to rerun the model. Run `monitor start`, then check the session with `result`.
- A dead runner is marked interrupted, never successful. Inspect workspace side effects before resuming.
- After updating the skill, if an old observer is still serving, run `monitor stop`, then `monitor start`, and reopen the URL.
