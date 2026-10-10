# Repository Guidelines

This repository publishes three maintained skills and three versioned prompt collections. README.md is a collection of copyable installation requests for agents; keep it usable without a directory tour or setup script.

- Maintained skills: `workbuddy-subagent`, `tech-impl-doc`, `grill-me`. Add others only when requested.
- Write skill instructions and repository documentation in English. Keep names aligned with their directories; preserve invocation policies and user constraints.
- Keep each skill self-contained. WorkBuddy's runtime scripts, monitor assets and vendor licenses are required skill resources; root installation scripts and unrelated generated examples are not.
- Never publish credentials, logs, private runtime configuration or personal consent. User-requested prompt snapshots may include environment-specific instructions; document their scope. WorkBuddy consent lives outside the skill in `~/.workbuddy-subagent/config.json` and is bound to its WorkBuddy data directory.
- Keep README requests simple and natural, usually one sentence naming the source and destination; leave routine installation details to the agent. Install complete folders, preserve unrelated settings and invocation policies, and verify discovery without running skill tasks or runtime setup. Global prompt installation merges matching rules or one named section; it never replaces an entire instruction file. Translation prompts apply only to a translation chat or an explicitly selected translation project.
- Keep prompt collections in `prompts/claude-global`, `prompts/codex-global` and `prompts/translation`. Name each version `YYYY-MM-DD-NAME.md` using its creation date; subsequent same-day versions use `YYYY-MM-DD-v02-NAME.md`, `v03`, etc. Preserve published files. Select the latest by date, then numeric version (unsuffixed is v01). README installation requests must point to the collection, not a pinned version.
- Before deleting resources, inspect their references. Keep README links and skill references valid.

For WorkBuddy runtime changes, run `python3 -m unittest discover -s tests -p 'test_workbuddy*.py' -q` and `node --test tests/workbuddy-*.test.cjs`. DOM tests need development-only `jsdom` 26.1.0; install it in a temporary directory and point `NODE_PATH` at that directory's `node_modules`. Native IPC and HTTP tests require local socket access. The shipped skill needs no npm install.

Validate changed skill frontmatter, meaningful behavior and local installation. Use the host's skill validator when available; `grill-me` retains Claude Code's `disable-model-invocation` field plus Codex's `allow_implicit_invocation: false` policy. A validator with a narrower field allowlist may require checking that field separately. Do not remove the invocation restriction to satisfy a validator. Pure prose edits need review, not tests that match exact wording.

Use conventional commit subjects of at most 50 characters. PRs should describe final behavior, validation and compatibility limits. Merge only an inspected, tested head with no failing required checks.
