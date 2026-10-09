---
name: workbuddy-subagent
description: Use WorkBuddy's bundled CLI as a resumable subagent. Consult Claude/Opus for plan and architecture discussion, tradeoffs, product decisions, frontend design and writing; consult GPT/Astra for factual investigation, verification and execution of agreed plans. Use when WorkBuddy is requested, a task benefits from an external thinking partner or verifier, or a WorkBuddy session should continue.
---

# WorkBuddy Subagent

Use WorkBuddy's installed CLI and existing login. The parent agent owns scope, validation, and delivery; WorkBuddy supplies an independent model session. No MCP bridge or additional model API key is required on compatible installations.

On recent encrypted installations, use the native credential bootstrap adapter described in [compatibility](references/compatibility.md). It requires explicit user consent to read WorkBuddy's native credential-protection material. Reuse consent already recorded in this skill's local `user-config.json`; do not ask again. Never enable it on someone else's installation merely because the skill was copied there.

Resolve `SKILL_DIR` to the directory containing this file. Use absolute paths for the helper, task workspace, prompt file, and output log. Requires Python 3.9+, Node.js 18.20.8+, and WorkBuddy. Automatic application discovery is currently macOS only.

## Choose a model by task

These are the user's practical routing preferences, not universal rankings. Neither family is infallible; code, tests and sources settle factual questions whichever model raised them.

- **Claude, newest Opus: thinking partner.** Consult it often, not only for polish. Use it for plans, architecture, tradeoffs, product decisions, alternative approaches, subjective judgment, frontend/UI design, writing, technical blogs, narrative structure and imaginative ideas.
- **GPT, newest Astra: investigator and executor.** Use it for factual investigation, validation, correctness checks, reproducible evidence, code review and precise execution of an agreed plan. The user finds it meticulous with facts but less helpful for subjective ideation.

| Profile | Model | Use for |
| --- | --- | --- |
| `brainstorm` | Opus | Plan and architecture discussion, tradeoffs, product decisions, alternatives, reframing, ideation |
| `design` | Opus | Frontend interfaces, visual hierarchy, interaction states, alternative layouts |
| `writing` | Opus | Writing, editing, technical blogs, narrative structure, clear explanations |
| `review` | Astra | Factual investigation, checking claims and plan premises, edge cases, invariants, code and design review |
| `execute` (CLI default) | Astra | Precise implementation of an agreed plan, debugging, reproducible verification |

**Choose `--profile` explicitly for new tasks.** The helper defaults to `execute`, so a discussion launched without `--profile brainstorm` goes to Astra unless an explicit `--model` overrides it.

Consult Opus proactively at decision points: when several reasonable options exist, before committing to a nontrivial plan or architecture, when the user asks for an opinion or recommendation, or when progress has stalled. Do not delegate trivial, mechanical or already-decided work.

| Scenario | Route |
| --- | --- |
| "Queue or cron for this sync job?" / "How should we split this module?" | `brainstorm` (Opus); keep read-only tools if it must inspect the repo |
| "Which onboarding flow should ship first?" | `brainstorm` (Opus) |
| "Redesign this settings page" / "Draft a blog post on this release" | `design` / `writing` (Opus) |
| "Does this library really retry on 429? Show me where." | `review` (Astra), read-only tools |
| "Is this migration plan safe for our schema?" | Opus proposes or critiques the plan, then Astra checks its premises with `review` |
| "Implement the approved plan in this checkout" | `execute` (Astra) |

### Mixed work

1. Opus produces an opinionated proposal: a recommendation, credible alternatives, tradeoffs, assumptions, and what would change its mind.
2. The parent extracts the **falsifiable premises** (API behavior, constraints, compatibility, performance, edge cases, feasibility) and asks Astra to test them with `review`.
3. Keep two outcomes separate. **Falsifiable errors** are settled by evidence, not by which model asserted them. **Subjective disagreements** (taste, priorities, risk appetite) are reported as tradeoffs for the parent or user to decide.
4. Resume Opus with verified facts or user feedback when they affect the recommendation or clarify a tradeoff. Do not force both models onto every task.

### Explicit choices and exact IDs

An explicit user model choice always wins. "Claude" or "Opus" maps to `--model claude` (newest Opus). "GPT" or "Astra" maps to `--model gpt` (newest Astra). A named model such as Sonnet, Sol or a `-1m` variant needs its exact catalog ID in `--model EXACT_ID`. Family-level preferences never authorize a different tier: automatic selection only picks Opus or Astra.

On resume, always pass the exact model ID recorded for the previous turn. The packaged CLI can reset to `auto` when `--model` is omitted, so the helper rejects that ambiguity. Change the ID only when deliberately switching models. To obtain an independent opinion, create a separate session.

Discover the current catalog before starting work:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" doctor
python3 "$SKILL_DIR/scripts/workbuddy.py" models --cwd /absolute/task/workspace
```

The helper selects the highest numeric version **within the requested flagship family**. `gpt-6.1-sol` does not outrank `gpt-6-astra` just because its minor version is newer. Current verified catalog IDs include `gpt-6-astra` and `claude-opus-5.5`; never substitute Anthropic's API spelling `claude-opus-5-5` for WorkBuddy's ID. Missing families fail explicitly; do not silently use `auto`, Sol, Luna, Sonnet, or Haiku.

For a request about the latest or strongest model, check official vendor model pages as well as the local catalog. Catalog presence establishes a routing ID, not successful inference access or comparative quality. New flagship family names require an explicit routing decision; see [model policy](references/model-policy.md).

## Delegate a bounded task

Write a UTF-8 prompt file with: objective, relevant context, allowed workspace/files, acceptance criteria, and requested output. External sessions do not inherit the parent chat. Include relevant repository instructions and any user constraints. Ask for findings, assumptions, evidence, and unresolved questions; do not request hidden reasoning. For decisions, ask Opus for a recommendation and tradeoffs; for open exploration, invite alternatives and reframing. Ask Astra for evidence (paths and lines, commands, sources), a verdict per claim, and explicit "undetermined" items. Brief templates are in [model policy](references/model-policy.md#example-briefs).

For a self-contained discussion or supplied-text review, disable tools. If Opus must inspect the repository to discuss its architecture, omit `--tools` to keep the read-only default.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --profile brainstorm --tools '' \
  --prompt-file /absolute/task/brief.txt --output /absolute/task/opus-turn-1.jsonl
```

For read-only source review or factual investigation, omit `--tools`: the default is `Read,Glob,Grep`, with `plan` permission mode.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/project --profile review \
  --prompt-file /absolute/task/facts.txt --output /absolute/task/astra-facts.jsonl
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
  --model gpt-6-astra \
  --prompt-file /absolute/task/follow-up.txt --output /absolute/task/turn-2.jsonl
```

Replace `gpt-6-astra` with that session's recorded model ID. Use a new output path each turn. Never use the ambiguous CLI `--continue` when several tasks exist. Never send overlapping turns to the same session. Keep workspace and tool permissions explicit on every turn.

For sustained work, start `run` through the host's persistent execution-session tool, yield promptly, and retain its handle. `--timeout 0` (default) permits a long model turn; `--max-turns` defaults to 20 and may be increased for a scoped task. This does not make the model run forever or resume automatically after an app/machine restart.

For long waits in Codex, use a thread heartbeat at the user's preferred cadence (normally five minutes), then yield the foreground. Persist the execution handle, WorkBuddy session ID, log, checkpoint, remaining work, success criteria, and authorization limits. Continue already-authorized validation and delivery when the task finishes; keep unchanged checks quiet and pause the heartbeat after full completion. If the host has no persistent execution support, state that limitation instead of promising unattended work.

WorkBuddy's `--bg`/`agents --jobs` capabilities vary with the packaged CLI. They are **not the default path**: this machine's 5.7.6 package could acknowledge a background launch while leaving an empty log, and its job query returned a missing route. Do not equate launch acknowledgement with a functioning worker.

## Verify before reporting completion

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" result /absolute/task/turn-2.jsonl
```

Require a final successful result, nonempty output, no reported errors/permission denials, and the actual task acceptance checks. `run` also verifies that the CLI's reported model matches the requested ID. Missing final output, authentication errors, time/turn limits, and cancelled requests are incomplete work. The helper returns nonzero for these conditions. A subagent's confident answer is not independent validation.

If model invocation fails, preserve the diagnostic and stop dependent work. Do not retry indefinitely, downgrade the model, export credentials, or disable WorkBuddy credential encryption. Follow [compatibility and troubleshooting](references/compatibility.md). A working desktop and a readable model catalog do not guarantee that independently launched CLI inference works.
