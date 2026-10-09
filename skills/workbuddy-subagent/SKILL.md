---
name: workbuddy-subagent
description: Use WorkBuddy's bundled CLI as a resumable subagent. Consult Claude for plan and architecture discussion, tradeoffs, product decisions, frontend design and writing; consult GPT for factual investigation, verification and execution of agreed plans. Use when WorkBuddy is requested, a task benefits from an external thinking partner or verifier, or a WorkBuddy session should continue.
---

# WorkBuddy Subagent

Use WorkBuddy's installed CLI and existing login. The parent agent owns scope, validation, and delivery; WorkBuddy supplies an independent model session. No MCP bridge or additional model API key is required on compatible installations.

On recent encrypted installations, use the native credential bootstrap adapter described in [compatibility](references/compatibility.md). It requires explicit user consent to read WorkBuddy's native credential-protection material. Reuse consent already recorded in this skill's local `user-config.json`; do not ask again. Never enable it on someone else's installation merely because the skill was copied there.

Resolve `SKILL_DIR` to the directory containing this file. Use absolute paths for the helper, task workspace, prompt file, and output log. Requires Python 3.9+, Node.js 18.20.8+, and WorkBuddy. Automatic application discovery is currently macOS only.

## Choose a model by task

The stable choice is the provider family, not a model name: use the latest, most capable Claude and GPT available through WorkBuddy, even when their flagship names change. These are the user's practical routing preferences, not universal rankings. Neither family is infallible; code, tests and sources settle factual questions whichever model raised them.

- **Latest, strongest Claude: thinking partner.** Consult it often, not only for polish. Use it for plans, architecture, tradeoffs, product decisions, alternative approaches, subjective judgment, frontend/UI design, writing, technical blogs, narrative structure and imaginative ideas.
- **Latest, strongest GPT: investigator and executor.** Use it for factual investigation, validation, correctness checks, reproducible evidence, code review and precise execution of an agreed plan. The user finds it meticulous with facts but less helpful for subjective ideation.

| Profile | Model | Use for |
| --- | --- | --- |
| `brainstorm` | Claude | Plan and architecture discussion, tradeoffs, product decisions, alternatives, reframing, ideation |
| `design` | Claude | Frontend interfaces, visual hierarchy, interaction states, alternative layouts |
| `writing` | Claude | Writing, editing, technical blogs, narrative structure, clear explanations |
| `review` | GPT | Factual investigation, checking claims and plan premises, edge cases, invariants, code and design review |
| `execute` (CLI default) | GPT | Precise implementation of an agreed plan, debugging, reproducible verification |

**Choose `--profile` to describe the task, then resolve and pass `--model EXACT_ID`.** Profiles guide the parent toward Claude or GPT; the helper does not infer capability or choose a model from a profile.

Consult Claude proactively at decision points: when several reasonable options exist, before committing to a nontrivial plan or architecture, when the user asks for an opinion or recommendation, or when progress has stalled. Do not delegate trivial, mechanical or already-decided work.

| Scenario | Route |
| --- | --- |
| "Queue or cron for this sync job?" / "How should we split this module?" | `brainstorm` (Claude); keep read-only tools if it must inspect the repo |
| "Which onboarding flow should ship first?" | `brainstorm` (Claude) |
| "Redesign this settings page" / "Draft a blog post on this release" | `design` / `writing` (Claude) |
| "Does this library really retry on 429? Show me where." | `review` (GPT), read-only tools |
| "Is this migration plan safe for our schema?" | Claude proposes or critiques the plan, then GPT checks its premises with `review` |
| "Implement the approved plan in this checkout" | `execute` (GPT) |

### Mixed work

1. Claude produces an opinionated proposal: a recommendation, credible alternatives, tradeoffs, assumptions, and what would change its mind.
2. The parent extracts the **falsifiable premises** (API behavior, constraints, compatibility, performance, edge cases, feasibility) and asks GPT to test them with `review`.
3. Keep two outcomes separate. **Falsifiable errors** are settled by evidence, not by which model asserted them. **Subjective disagreements** (taste, priorities, risk appetite) are reported as tradeoffs for the parent or user to decide.
4. Resume Claude with verified facts or user feedback when they affect the recommendation or clarify a tradeoff. Do not force both models onto every task.

### Resolve the current flagship

Before a new delegated task, inspect WorkBuddy's catalog and current official model guidance. Select the latest, highest-capability general-purpose model from the chosen provider that WorkBuddy exposes, including any newly named flagship. Favor capability over price or speed; a newer date, larger version number, longer context or familiar suffix does not establish stronger capability.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" doctor
python3 "$SKILL_DIR/scripts/workbuddy.py" models --cwd /absolute/task/workspace
```

The parent agent resolves the model using official sources and the catalog; the Python helper only validates and invokes the exact ID. It does not scrape model rankings, rank IDs, or map `claude`/`gpt` aliases to permanent brands. Pass `--model EXACT_ID` on every call. Record the ID, check date and selection evidence in task notes. Reuse that decision within the same task; recheck for a new task or changed catalog/vendor guidance. See [model policy](references/model-policy.md) for source links and selection details.

An explicit user model choice always wins. A generic request for Claude or GPT means the current strongest model from that provider, not a permanent Opus/Astra tier. If the user names a specific model or tier, resolve that request instead. Report any gap between the vendor's flagship and WorkBuddy availability; do not disguise a cheaper, older or fallback model as the latest strongest. Catalog presence is not proof of successful inference.

Current tested WorkBuddy IDs are `claude-opus-5.5` and `gpt-6-astra` (2026-10-09). These are dated examples, not permanent defaults or a ranking of every model released by the vendors. Set `CLAUDE_MODEL` and `GPT_MODEL` in the examples below to the exact IDs resolved for the current task; do not blindly copy these historical IDs.

On resume, pass the exact model ID recorded for that conversation unless intentionally switching. The packaged CLI can reset to `auto` when `--model` is omitted. A new flagship does not silently change an ongoing conversation. To obtain an independent opinion, create a separate session.

## Delegate a bounded task

Write a UTF-8 prompt file with: objective, relevant context, allowed workspace/files, acceptance criteria, and requested output. External sessions do not inherit the parent chat. Include relevant repository instructions and any user constraints. Ask for findings, assumptions, evidence, and unresolved questions; do not request hidden reasoning. For decisions, ask Claude for a recommendation and tradeoffs; for open exploration, invite alternatives and reframing. Ask GPT for evidence (paths and lines, commands, sources), a verdict per claim, and explicit "undetermined" items. Brief templates are in [model policy](references/model-policy.md#example-briefs).

For a self-contained discussion or supplied-text review, disable tools. If Claude must inspect the repository to discuss its architecture, omit `--tools` to keep the read-only default.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --profile brainstorm --model "$CLAUDE_MODEL" --tools '' \
  --prompt-file /absolute/task/brief.txt --output /absolute/task/claude-turn-1.jsonl
```

For read-only source review or factual investigation, omit `--tools`: the default is `Read,Glob,Grep`, with `plan` permission mode.

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/project --profile review --model "$GPT_MODEL" \
  --prompt-file /absolute/task/facts.txt --output /absolute/task/gpt-facts.jsonl
```

For authorized edits, preferably use an isolated checkout. Enable only the necessary tools:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/isolated/checkout --profile execute --model "$GPT_MODEL" \
  --permission-mode acceptEdits --tools Read,Glob,Grep,Edit,Write \
  --prompt-file /absolute/task/implementation.txt --output /absolute/task/implementation.jsonl
```

Run appropriate tests and inspect the diff in the parent agent. Add `Bash` only if the task needs shell execution and the user has authorized its scope. File/tool restrictions and permission modes are not an OS sandbox. Do not enable bypass permissions to make a blocked task pass. The helper disables hooks and inherited MCP servers and excludes project/local CLI settings; pass needed context in the brief.

## Continue and manage longer tasks

Record the printed `session_id`, chosen model, absolute workspace, output path, host execution handle, task scope, and acceptance criteria. The native CLI persists conversation history. Resume **that exact session** after its previous turn exits:

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" run \
  --cwd /absolute/task/workspace --resume SESSION_ID --tools '' \
  --model "$SESSION_MODEL" \
  --prompt-file /absolute/task/follow-up.txt --output /absolute/task/turn-2.jsonl
```

Set `SESSION_MODEL` to that session's recorded exact model ID. Use a new output path each turn. Never use the ambiguous CLI `--continue` when several tasks exist. Never send overlapping turns to the same session. Keep workspace and tool permissions explicit on every turn.

For sustained work, start `run` through the host's persistent execution-session tool, yield promptly, and retain its handle. `--timeout 0` (default) permits a long model turn; `--max-turns` defaults to 20 and may be increased for a scoped task. This does not make the model run forever or resume automatically after an app/machine restart.

For long waits in Codex, use a thread heartbeat at the user's preferred cadence (normally five minutes), then yield the foreground. Persist the execution handle, WorkBuddy session ID, log, checkpoint, remaining work, success criteria, and authorization limits. Continue already-authorized validation and delivery when the task finishes; keep unchanged checks quiet and pause the heartbeat after full completion. If the host has no persistent execution support, state that limitation instead of promising unattended work.

WorkBuddy's `--bg`/`agents --jobs` capabilities vary with the packaged CLI. They are **not the default path**: this machine's 5.7.6 package could acknowledge a background launch while leaving an empty log, and its job query returned a missing route. Do not equate launch acknowledgement with a functioning worker.

## Verify before reporting completion

```bash
python3 "$SKILL_DIR/scripts/workbuddy.py" result /absolute/task/turn-2.jsonl
```

Require a final successful result, nonempty output, no reported errors/permission denials, and the actual task acceptance checks. `run` also verifies that the CLI's reported model matches the requested ID. Missing final output, authentication errors, time/turn limits, and cancelled requests are incomplete work. The helper returns nonzero for these conditions. A subagent's confident answer is not independent validation.

If model invocation fails, preserve the diagnostic and stop dependent work. Do not retry indefinitely, downgrade the model, export credentials, or disable WorkBuddy credential encryption. Follow [compatibility and troubleshooting](references/compatibility.md). A working desktop and a readable model catalog do not guarantee that independently launched CLI inference works.
