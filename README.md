# Agent Kit

A small collection of skills and prompts. Copy a request below into your agent; skill installation does not run the skill.

## Skills

### WorkBuddy subagent

Resumable Claude and GPT sessions through WorkBuddy's bundled CLI, with a local live Markdown monitor. Runs at high effort with no imposed turn limit by default; the parent agent periodically checks progress and decides when to intervene. Requires WorkBuddy, an existing login, Python 3.9+ and Node.js 18.20.8+; automatic discovery and native login initialization are currently validated on macOS.

```text
Install the complete skill at https://github.com/acking-you/agent-kit/tree/main/skills/workbuddy-subagent into your global skills directory without running it.
```

### Technical documentation

Write evidence-based implementation, architecture and troubleshooting explanations, or make a focused edit without restructuring the rest of a document.

```text
Install the complete skill at https://github.com/acking-you/agent-kit/tree/main/skills/tech-impl-doc into your global skills directory without running it.
```

### Grill me

Stress-test a plan through one question at a time, with recommendations, until the important decisions are clear. Explicit invocation only; self-contained.

```text
Install the complete skill at https://github.com/acking-you/agent-kit/tree/main/skills/grill-me into your global skills directory without running it.
```

## Prompts

Each purpose has a stable folder containing dated versions. A filename records when that version was created: `YYYY-MM-DD-CLAUDE.md`, `YYYY-MM-DD-AGENTS.md` or `YYYY-MM-DD-TRANSLATE.md`. The first dated versions were archived on **2026-10-09**; older edits remain in Git history. Keep published versions unchanged and add a new file for each revision. For another version on the same day, use `YYYY-MM-DD-v02-NAME.md`, then `v03`, and so on; an unsuffixed file is version 1. Select the newest date, then the highest numeric version on that date. Installation never changes the source filename or its date.

### Claude global instructions

[Versions](prompts/claude-global/). Engineering preferences for Claude Code across projects. Install into the user-level `~/.claude/CLAUDE.md`, as described in [Claude Code's memory documentation](https://code.claude.com/docs/en/memory#choose-where-to-put-claudemd-files).

```text
Find the latest dated CLAUDE.md version in https://github.com/acking-you/agent-kit/tree/main/prompts/claude-global: choose the newest YYYY-MM-DD, then the highest numeric vNN on that date (no suffix means v01). Read it and install it as my Claude Code global instructions in ~/.claude/CLAUDE.md. Inspect the existing file first; merge the selected content into one Agent Kit Claude section, updating an existing MyClaude Engineering or Agent Kit Claude section or incorporating matching rules without duplicates. Preserve unrelated instructions and my explicit choices. Keep the installation filename CLAUDE.md rather than the dated archive name. Verify the saved content and report the source version and destination. If Claude Code is unavailable, report that instead of installing into another agent's configuration.
```

### Codex global instructions

[Versions](prompts/codex-global/). The first version is an exact snapshot of my local `~/.codex/AGENTS.md`, including macOS tooling, TSearch SSH and long-running-task preferences. Review its environment-specific rules when using it on another machine. Codex loads global instructions from its home directory and gives `AGENTS.override.md` precedence over `AGENTS.md`; see the [official OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

```text
Find the latest dated AGENTS.md version in https://github.com/acking-you/agent-kit/tree/main/prompts/codex-global: choose the newest YYYY-MM-DD, then the highest numeric vNN on that date (no suffix means v01). Read it and install it as my Codex global instructions in $CODEX_HOME/AGENTS.md, defaulting to ~/.codex/AGENTS.md when CODEX_HOME is unset. Inspect existing global instructions first, including AGENTS.override.md; report an override that would mask the installation without changing it. Merge into one Agent Kit Codex section, reconciling matching rules without duplication and preserving unrelated instructions. Check environment-specific paths and TSearch rules against this machine; preserve applicable rules and report anything inapplicable. Keep the installation filename AGENTS.md rather than the dated archive name. Verify the saved content and report the source version, destination and any load-precedence issue. Do not copy it into the repository's AGENTS.md.
```

### Translation task prompt

[Versions](prompts/translation/). A reusable prompt for a dedicated translation chat or a translation project's instructions. It preserves technical meaning, code and structured formats; it is not a global coding-agent prompt.

```text
Find the latest dated TRANSLATE.md version in https://github.com/acking-you/agent-kit/tree/main/prompts/translation: choose the newest YYYY-MM-DD, then the highest numeric vNN on that date (no suffix means v01). Read it and use it as the instructions for this translation conversation. If I explicitly select a dedicated translation project, install it into that project's instructions instead, preserving unrelated content and avoiding duplicates. Do not add it to global CLAUDE.md or AGENTS.md. Report the chosen source version and where it applies, then use my supplied target language and text; if either is missing, ask for it. Do not claim persistent installation when you only loaded the prompt into this chat.
```

Updates use the same instructions. The agent should compare existing files before applying changes and preserve personal configuration. Repository maintenance and validation guidance is in [AGENTS.md](AGENTS.md).
