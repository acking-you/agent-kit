# MyClaude Skills

Claude Code skills and prompts collection.

## Installation

```bash
./install.sh install codex-session-history  # Install one skill
./install.sh install-all    # Install all skills to ~/.claude/skills/
./install.sh prompt-update  # Update ~/.claude/CLAUDE.md
```

Run `./install.sh help` for more options.

The installer requires `rsync`. Updates preserve the destination's personal `user-config.json` and never import consent from the source tree.

## Featured Skills

- `workbuddy-subagent`: Use WorkBuddy's CLI as a resumable subagent: the latest strongest available Claude for discussion, design and writing; GPT for investigation, verification and execution. Includes authorized native login initialization and strict result/model validation. The local dashboard shows streaming Markdown replies, tool calls, change previews and resumed turns, with English/Chinese and light/dark/System preferences. Markdown dependencies are bundled; no CDN is used. Tested with WorkBuddy 5.7.6; see the skill's compatibility notes for limits.
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
