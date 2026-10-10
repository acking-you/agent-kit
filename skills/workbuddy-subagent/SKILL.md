---
name: workbuddy-subagent
description: Delegate scoped work to WorkBuddy's bundled CLI, supervise resumable sessions, and verify their results. Use when WorkBuddy is requested, an independent thinking partner or verifier would help, or an existing WorkBuddy task needs recovery. Prefer Claude for planning, design and writing; GPT for factual review and precise execution, unless the user chooses otherwise.
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

`--profile` describes intent; it never selects a model. An explicit user choice of provider or model for implementation overrides the default routing. Consult Claude proactively at real decision points: several viable options, before committing to a nontrivial plan, when the user asks for an opinion, or when progress stalls. Do not delegate trivial or already-decided work.

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

The external model does not inherit this chat. Write a UTF-8 brief with the objective, repository instructions, user constraints, allowed paths and tools, acceptance criteria, and who owns execution and delivery. Include relevant source evidence and prior findings; ask for conclusions and evidence, not hidden reasoning. Templates: [example briefs](references/model-policy.md#example-briefs).

Put referenced files inside the delegated workspace when its read scope is restricted, or include their contents in the prompt. Passing `--prompt-file` sends that file as text; it does not authorize the paths mentioned inside it. Keep working notes untracked and out of published artifacts. For repository tasks, scope every write, including persistent memory, to the allowed paths; finishing a turn does not authorize global memory updates.

Defaults: `--effort high`, `--timeout 0` (no imposed deadline), no imposed turn limit, tools `Read,Glob,Grep` in `plan` permission mode. Set `--max-turns` only when the user explicitly requests a cap. Hooks, inherited MCP servers and project/local CLI settings are excluded; put needed context in the brief.

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

Add `Bash` only for user-authorized shell scope. For source-only delegation, assign builds, tests, generators and delivery to the parent explicitly; exclude both shell and alternative execution tools. Do not infer this restriction for tasks where execution is authorized. Tool filters and permission modes are not an OS sandbox: check actual tool-use events and changed paths, not just the init tool inventory.

On a denied operation, diagnose the path, tool and scope before continuing. Correct a misplaced brief or perform authorized parent-owned work yourself; do not repeat the denied call, substitute another execution tool or expand permissions to evade the denial. If the running task repeatedly fails or crosses its scope, stop it through its execution handle, preserve its edits and inspect them before a corrected resume.

## Monitor

Each run starts or reuses a local read-only panel and prints `monitor_url`. Open it in the host browser panel, reusing an open panel when practical. In Codex: `open_in_codex` with `target: {type: "browser", url: monitor_url}` and `placement: "right"`. `--no-monitor` opts out. Closing the panel or running `monitor stop` never stops a task. Details: [monitoring](references/monitoring.md).

## Resume and long tasks

Keep the checkpoint and complete per-turn logs in a durable, non-published directory, outside OS temporary directories and disposable build caches. Without `--output`, the monitor stores a private log under `~/.workbuddy-subagent/monitor/runs`; an explicit output path must also survive the expected wait. Record session ID, exact model, workspace, execution handle, log, scope, validation state and remaining delivery steps. Label results by the source revision or stage they actually checked.

Resume the exact session only after confirming its previous turn exited or its runner is gone, with its recorded model and a new log path:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --resume SESSION_ID --tools '' \
  --model "$SESSION_MODEL" \
  --prompt-file /absolute/task/follow-up.txt --output /absolute/task/turn-2.jsonl
```

Never use `--continue` or send overlapping turns to one session. For an independent opinion, start a new session.

For long runs, launch through the host's persistent execution-session tool and keep its handle. For long waits in Codex, reuse or create a heartbeat on the current task (normally five minutes), save the checkpoint and yield. Keep the heartbeat prompt short and point it at that authoritative checkpoint instead of accumulating stale job histories. At each check, inspect sanitized activity, public output, relevant file changes and progress toward acceptance. Let useful work continue; intervene for repeated failures, unproductive repetition, scope drift or user direction. Quiet thinking alone is not a failure. To change direction, stop the runner through its execution handle, wait for exit and inspect side effects before resuming. The monitor only observes; it cannot steer or cancel a running turn.

Keep unchanged heartbeat checks quiet. A direct user status request still needs an explicit answer describing what remains active. When the run ends, finish already-authorized validation and delivery, then pause and verify only this task's heartbeat. For a missing handle, lost log or host restart, follow [interruption recovery](references/monitoring.md#interruption-recovery); never equate an unavailable handle with a completed task. Do not replace supervision with a fixed turn cap or blind retries. Without persistent execution support, state that limitation instead of promising unattended work. Do not rely on `--bg` or `agents --jobs`; they are unverified.

## Verify

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" result /absolute/task/turn-2.jsonl --model "$SESSION_MODEL"
```

The helper checks the final result and reported model, including nonempty success and reported errors or permission denials. It does not audit every tool result, enforce workspace scope, or verify the code. Inspect actual tool calls/results and changed paths as well; a successful final message does not erase a denied action or an unauthorized write. On failure, preserve the diagnostic and edits, withhold acceptance and diagnose before resuming. See [authentication failures](references/compatibility.md#authentication-failures); never retry blindly, downgrade silently, export credentials or disable encryption.

The parent owns acceptance. Check findings against actual source and reproducible failures; turn accepted findings into concrete fixes and discriminating regressions. Existing green tests do not refute an uncovered failure path, and a review finding without evidence is not automatically a required redesign. Track unresolved findings and resume the appropriate author or reviewer with the relevant evidence.

Run the repository's required checks on the resulting source. Coordinate shared builds and edits; checks run while source is changing are provisional. Regenerate bindings or translations when required, and inspect rendered UI when appearance is part of acceptance. A model result, compilation or one passing test suite does not complete downstream review or delivery. Report only checks actually run and preserve explicit limits on commits, pushes, publishing and live data.
