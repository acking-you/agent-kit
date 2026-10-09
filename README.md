# MyClaude Skills

Claude Code skills and prompts collection.

## Installation

```bash
./install.sh install codex-session-history  # Install one skill
./install.sh install-all    # Install all skills to ~/.claude/skills/
./install.sh prompt-update  # Update ~/.claude/CLAUDE.md
```

Run `./install.sh help` for more options.

## Featured Skills

- `workbuddy-subagent`: Delegate resumable tasks to WorkBuddy's bundled CLI. Uses the latest, strongest available Claude as a thinking partner for plans, architecture, tradeoffs and product decisions, as well as frontend design and writing. Uses the latest, strongest available GPT for factual investigation, verification, review and precise execution of agreed plans. Resolves current flagship IDs from official guidance and the WorkBuddy catalog, without locking routing to Opus/Astra names. Includes authorized native login initialization, runtime/model discovery, strict result validation, and a local live dashboard for streaming replies, tool calls, change previews and resumed turns. Model replies, session recall, and file editing were verified with WorkBuddy 5.7.6; see its compatibility notes for details and background execution limits.
- `codex-session-history`: Search local Codex sessions by session id, provider, time range, preview text, thread name, or archived status. Includes the bundled `scripts/codex_session_history.py` CLI.

For Codex, install `skills/workbuddy-subagent` into `$CODEX_HOME/skills/workbuddy-subagent` (normally `~/.codex/skills/workbuddy-subagent`). The repository's `install.sh` targets Claude Code instead.

## Structure

```
.
├── install.sh              # One-click installer
├── prompts/                # Global prompt configs
│   ├── CLAUDE.md           # Workflow configuration
│   └── TRANSLATE.md        # Translation guidelines
└── skills/                 # Claude Code skills
    ├── article-cover/      # Article cover image generation
    ├── codex/              # Codex CLI integration
    ├── codex-session-history/ # Local Codex session history search
    ├── excalidraw/         # Excalidraw diagram generation
    ├── frontend-design/    # Frontend UI design
    ├── gemini-image/       # Gemini image generation
    ├── gen-commit-msg/     # Auto-generate commit messages
    ├── git-squash-commits/ # Squash commits
    ├── github-wrapped/     # GitHub year-in-review generator
    ├── research/           # Technical research with citations
    ├── tech-blog/          # Technical blog post generation
    ├── tech-design-doc/    # Technical design doc generation
    ├── tech-impl-doc/      # Technical implementation doc generation
    └── workbuddy-subagent/ # WorkBuddy CLI delegation and live monitoring
```
