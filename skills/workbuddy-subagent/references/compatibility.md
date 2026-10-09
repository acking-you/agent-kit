# Compatibility and troubleshooting

## Runtime discovery

The helper uses the bundled `cli/bin/codebuddy`, not an unrelated `codebuddy` found on `PATH`. macOS defaults:

- Application: `/Applications/WorkBuddy.app`
- User configuration: `~/.workbuddy`
- Product configuration: `~/.workbuddy/cache/acc-product-config-v3.json`
- Node.js: `node` on `PATH`

Optional overrides: `WORKBUDDY_HOME`, `WORKBUDDY_CLI_PATH`, `WORKBUDDY_NODE`, `WORKBUDDY_DATA_DIR`, `ACC_PRODUCT_CONFIG_PATH`. Set them to trusted local paths. Do not put tokens in them. Other platforms require explicit paths and have not been validated.

The Python helper reads the product network environment and the application's version for startup context. It sets WorkBuddy's product identity and forces the headless bundle because recent desktop packages can omit the full TUI bundle. It does not print stored login credentials.

Model discovery uses a short-lived native ACP connection (`initialize`, `session/new`) without sending a model prompt. Task execution uses `--print --output-format stream-json`; continuation uses `--resume SESSION_ID --model EXACT_ID`. No third-party bridge dependency is required.

## Authentication

### Native credential bootstrap (explicit opt-in)

The desktop does more than set environment paths: it obtains credential-protection material through its native `workbuddyStorage.loggerGet` API and sends a bootstrap payload to the CLI. Independently launched Node.js lacks that initialization and cannot read encrypted authentication fields.

`scripts/native-bootstrap.cjs` reproduces that startup contract using **the installed WorkBuddy Electron runtime and installed JavaScript modules**. It does not bundle WorkBuddy source or cryptographic keys. The adapter keeps `fields` encryption enabled, reads the existing keyblob without creating or replacing it, and initializes only the CLI process it just spawned. A random token, expected PID and session identifier bind delivery to that child, over a Unix socket in a private `0700` directory. The adapter clears its key buffers after acknowledgement and removes its temporary sockets after exit. Keys and login tokens are never written to task logs, skill files, command-line arguments, or environment variables.

Obtain explicit user authorization for this native credential-protection access. For a single authorized invocation, set `WORKBUDDY_NATIVE_BOOTSTRAP=1`. To retain that user's authorization for their installed copy, create `user-config.json` beside `SKILL.md`, mode `0600`, containing:

```json
{"native_bootstrap_consent": true}
```

This file is personal configuration and must not be committed or distributed. With no consent, the helper uses ordinary CLI startup. If native initialization fails, it fails closed; never retry by disabling encryption or extracting credentials to plaintext. The adapter uses internal version-dependent APIs; re-run the model, resume, and tool smoke checks after WorkBuddy updates.

An error such as `Authentication required` or HTTP 401 must be treated as failure even if ACP initialization succeeded, the process exited zero, or a session ID was returned.

1. Check whether the desktop can send a message. If it cannot, let the user sign in through WorkBuddy's normal login flow and retry once.
2. If the desktop works but independently launched CLI inference fails, check whether native credential bootstrap is enabled and authorized. Relogging repeatedly is not a justified fix for missing bootstrap.
3. Do not disable encryption, scrape process tokens, export keys or tokens, change the account's credential storage, or claim that model discovery validates inference.

## Verified on macOS, 2026-10-09

WorkBuddy 5.7.6 bundled CLI 2.156.0:

- Runtime discovery, ACP initialization and model catalog enumeration succeeded.
- With explicitly authorized native bootstrap, `gpt-6-astra` completed a correctness review and `claude-opus-5.5` drafted a technical-blog opening. Both produced successful final results with no permission denials; the stream reported the requested model IDs. No tools were called during these text-only tasks.
- A fresh CLI process resumed the Astra conversation and recalled a marker supplied only in the first turn, together with the earlier bug. The successful retest explicitly pinned `gpt-6-astra` and verified the reported model.
- A fresh process resumed Opus, recalled its original article title and concrete example, and proposed two frontend layouts with waiting, failed and verified states plus an accessibility consideration. The reported model remained `claude-opus-5.5`.
- Astra used `Read` and `Edit` to fix a temporary Python word counter. The parent independently passed nine empty-input, whitespace, mixed-separator and Unicode cases. The tool trace showed only those two tools, targeting the assigned file.
- The global skill also worked with consent saved in its local `user-config.json`, without an environment opt-in on each invocation. Task logs were created with mode `0600`.

Two integration issues were reproduced and handled:

1. Before native bootstrap, both print-mode inference and an ACP prompt failed with `Authentication required` while the desktop worked. Supplying WorkBuddy's native credential initialization resolved actual inference; repeated desktop login was unnecessary.
2. Native `--resume` without `--model` recalled history but reported `auto` instead of the previous Astra model. The helper now requires an exact model ID on resume and rejects successful outputs whose reported model does not match the request.

Model selection is now resolved by the parent from current vendor guidance and the WorkBuddy catalog. `run` requires an exact `--model` on new tasks as well as resumes; the earlier `claude`, `gpt` and `frontier` aliases no longer guess a permanent Opus/Astra tier. `models` returns an unranked catalog without a guessed default.

The stream's initial `tools` list describes the registered inventory, not the effective `--tools` filter. The installed source applies that filter when enabling tools. Inspect actual tool-use events when validating behavior.

During initial diagnostics, `--bg` acknowledged a launch but produced an empty log; `agents --jobs` reported `No mapping found: POST /internal/agents`. Without the headless override, that command also tried to load the omitted full CLI bundle. Native background jobs remain unverified; the validated workflow uses host execution sessions and explicit CLI resumption. Do not reuse these results as proof for a newer WorkBuddy build.

## Long-running work

Prefer a persistent execution handle supplied by the parent agent's host. Save the native session ID and stream log while the CLI is alive. Use an explicit resume after completion or interruption; inspect the workspace before repeating side-effecting work. This skill does not install a daemon, launch agent, cron job, or automatic retry loop.

Output files must not already exist. They are created with mode `0600`, updated as events arrive, and may contain task context or source code; keep them outside the published skill repository. A missing final result is a pending/failed task, never a completed task.
