# Agent Kit

A small collection of skills and prompts. Copy a request below into your agent.

## Skills

### WorkBuddy subagent

Resumable Claude and GPT sessions through WorkBuddy's bundled CLI, with a local live Markdown monitor. Runs at high effort with no imposed turn limit by default; the parent agent periodically checks progress and decides when to intervene. Requires WorkBuddy, an existing login, Python 3.9+ and Node.js 18.20.8+; automatic discovery and native login initialization are currently validated on macOS.

```text
Install the skill at https://github.com/acking-you/agent-kit/tree/main/skills/workbuddy-subagent into my global skills directory.
```

### Technical documentation

Write evidence-based implementation, architecture and troubleshooting explanations, or make a focused edit without restructuring the rest of a document.

```text
Install the skill at https://github.com/acking-you/agent-kit/tree/main/skills/tech-impl-doc into my global skills directory.
```

### Grill me

Stress-test a plan through one question at a time, with recommendations, until the important decisions are clear. Explicit invocation only.

```text
Install the skill at https://github.com/acking-you/agent-kit/tree/main/skills/grill-me into my global skills directory.
```

## Prompts

Each folder holds dated versions named `YYYY-MM-DD-NAME.md`; later versions from the same day add `-v02`, `-v03` and so on. The latest is the newest date, then the highest version.

### Claude global instructions

[Versions](prompts/claude-global/). Engineering preferences for Claude Code across projects, for the user-level `~/.claude/CLAUDE.md` ([Claude Code memory docs](https://code.claude.com/docs/en/memory#choose-where-to-put-claudemd-files)).

```text
Merge the latest version from https://github.com/acking-you/agent-kit/tree/main/prompts/claude-global into my global Claude Code instructions at ~/.claude/CLAUDE.md.
```

### Codex global instructions

[Versions](prompts/codex-global/). The first version is a snapshot of my local `~/.codex/AGENTS.md`, including macOS tooling, TSearch SSH and long-running-task preferences, so some rules are specific to my environment. See the [Codex AGENTS.md docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

```text
Merge the latest version from https://github.com/acking-you/agent-kit/tree/main/prompts/codex-global into my global Codex instructions at ~/.codex/AGENTS.md.
```

### Translation task prompt

[Versions](prompts/translation/). A reusable prompt for a dedicated translation chat or a translation project's instructions. It preserves technical meaning, code and structured formats; it is not a global coding-agent prompt.

```text
Use the latest version from https://github.com/acking-you/agent-kit/tree/main/prompts/translation as the instructions for this translation chat.
```

To update, send the same request again. Repository maintenance guidance is in [AGENTS.md](AGENTS.md).
