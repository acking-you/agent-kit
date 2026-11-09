# Repository Guidelines

README.md holds copyable installation requests for agents: usually one sentence naming the source and destination, with no directory tour, setup script or routine installation steps. Prompt requests point to the collection, not a pinned version.

- Maintained skills: `workbuddy-subagent`, `claude-code-subagent`, `tech-impl-doc`, `grill-me`. Add others only when requested.
- Write skills and repository documentation in English. Keep each skill self-contained: runtime scripts, monitor assets and vendor licenses ship inside it; root installation scripts and unrelated generated examples do not.
- Never publish credentials, logs, private runtime configuration or personal consent. WorkBuddy consent lives outside the skill in `~/.workbuddy-subagent/config.json`. Prompt snapshots with environment-specific rules must say so.
- Installing from README copies complete skill folders, preserves unrelated settings and invocation policies, and verifies discovery without running skill tasks or runtime setup. A global prompt overwrites the whole instruction file with the latest version instead of merging into it. Translation prompts apply only to a translation chat or an explicitly selected translation project. A language guide loads only for work in that language, never through a global prompt.
- Prompt collections live in `prompts/claude-global`, `prompts/codex-global`, `prompts/translation` and, one per language, `prompts/language-guides/<language>`. Language guides hold only distilled, portable rules that agents do not follow by default. Name versions `YYYY-MM-DD-NAME.md` by creation date, and later same-day versions `YYYY-MM-DD-v02-NAME.md`, `v03` and so on; the latest is the newest date, then the highest version. Never modify or delete a version already on `main`.

## Validation

- Claude Code runtime: `python3 -m unittest discover -s tests -p 'test_claude_code_subagent.py' -q`, `node --test tests/claude-code-*.test.cjs`, and the shared monitor suites against its assets: `MONITOR_TEST_ASSETS=$PWD/skills/claude-code-subagent/assets/monitor WORKBUDDY_TEST_PREFERENCES=$PWD/skills/claude-code-subagent/assets/monitor/preferences.js node --test tests/workbuddy-ui.test.cjs tests/workbuddy-preferences.test.cjs`.
- WorkBuddy runtime: `python3 -m unittest discover -s tests -p 'test_workbuddy*.py' -q` and `node --test tests/workbuddy-*.test.cjs`.
- DOM tests need development-only `jsdom` 26.1.0 installed in a temporary directory, with `NODE_PATH` pointing at its `node_modules`. Native IPC and HTTP tests need local socket access. The shipped skills need no npm install.
- Validate changed skills with the host's skill validator and a local install. `grill-me` keeps both Claude Code's `disable-model-invocation` and Codex's `allow_implicit_invocation: false`; if a validator rejects one, check it separately instead of removing it. Prose-only edits need review, not tests.

Use conventional commit subjects of at most 50 characters. PRs describe final behavior, validation and compatibility limits.
