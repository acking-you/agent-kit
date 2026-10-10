# Compatibility and troubleshooting

## Runtime discovery

The helper runs WorkBuddy's bundled `cli/bin/codebuddy`, never an unrelated `codebuddy` on `PATH`, and forces the headless bundle because recent desktop packages can omit the full TUI bundle. macOS defaults:

- Application: `/Applications/WorkBuddy.app`
- User configuration: `~/.workbuddy`
- Product configuration: `~/.workbuddy/cache/acc-product-config-v3.json`
- Node.js: `node` on `PATH`

Overrides: `WORKBUDDY_HOME`, `WORKBUDDY_CLI_PATH`, `WORKBUDDY_NODE`, `WORKBUDDY_DATA_DIR`, `ACC_PRODUCT_CONFIG_PATH`. Point them at trusted local paths and never put tokens in them. Other platforms need explicit paths and are unvalidated.

`models` opens a short-lived native ACP connection (`initialize`, `session/new`) without prompting a model, so it does not validate inference. `run` uses `--print --output-format stream-json`; resume adds `--resume SESSION_ID --model EXACT_ID`.

## Native credential bootstrap

Independently launched Node.js cannot read WorkBuddy's encrypted authentication fields; the desktop initializes its CLI with credential-protection material from the native `workbuddyStorage.loggerGet` API. `scripts/native-bootstrap.cjs` reproduces that startup through the installed WorkBuddy Electron runtime and modules. It bundles no WorkBuddy source or keys, keeps encryption enabled, reads the existing keyblob without replacing it, and initializes only the child it spawned (random token, expected PID and session ID over a Unix socket in a `0700` directory). Keys and tokens never reach logs, skill files, arguments or environment variables.

Consent:

- The installation owner authorizes it once. For a single invocation, set `WORKBUDDY_NATIVE_BOOTSTRAP=1`.
- To persist it, create `~/.workbuddy-subagent/config.json` with mode `0600` in a `0700` directory, outside the installed skill, bound to the resolved absolute WorkBuddy data directory:

  ```json
  {"native_bootstrap_consent": true, "workbuddy_data_dir": "/absolute/path/to/.workbuddy"}
  ```

- Recorded consent is reused for the matching data directory without asking again. It is personal: never commit, copy or distribute it, and a different data directory does not inherit it.
- Older versions stored `user-config.json` beside `SKILL.md`, which the runtime no longer reads. During an authorized upgrade, migrate only consent known to belong to this installation into the file above, preserving its other fields; never migrate a file from the repository or someone else's skill.
- Without consent, the helper uses ordinary CLI startup. If bootstrap fails, it fails closed.

The adapter depends on internal, version-dependent APIs. After WorkBuddy updates, rerun model, resume and tool smoke checks.

## Authentication failures

`Authentication required` or HTTP 401 is a failure even if ACP initialized, the process exited zero or a session ID was returned.

1. If the desktop cannot send a message, have the user sign in through WorkBuddy's normal flow and retry once.
2. If the desktop works but CLI inference fails, check with `doctor` that native bootstrap is enabled and authorized. Repeated relogin does not fix a missing bootstrap.
3. Never disable encryption, scrape process tokens, export keys or tokens, change credential storage, or treat model discovery as proof of inference.

## Tested setup (macOS, 2026-10-09)

WorkBuddy 5.7.6 with bundled CLI 2.156.0, native bootstrap explicitly authorized:

- Discovery, ACP initialization and catalog enumeration succeeded.
- `gpt-6-astra` and `claude-opus-5.5` completed text-only tasks and fresh-process resumes with history recall, reporting the requested model IDs.
- Astra fixed a file using only `Read` and `Edit`; the parent's independent tests passed.
- Task logs were created with mode `0600`.

Known caveats (newer builds may differ):

- `--resume` without `--model` reported `auto`; the helper now requires an exact model and rejects mismatched reported models.
- The stream's initial `tools` list is the registered inventory, not the effective `--tools` filter. Inspect actual tool-use events.
- `--bg` acknowledged a launch but left an empty log, and `agents --jobs` returned `No mapping found: POST /internal/agents`. Native background jobs are unverified; use host execution sessions and explicit resume.

## Logs and diagnostics

The skill installs no OS service, cron job or retry loop; long runs rely on the parent host's persistent execution session.

Output paths must not already exist. Logs are created `0600`, written as events arrive, and may contain task context or source code, so keep them in durable private storage and out of published artifacts. The monitor records a log's path, not a backup. A missing final result means pending or failed, never complete.

Prompts travel through stdin from a private temporary file, so large briefs avoid process argument limits. CLI stderr is kept separately with mode `0600`: `<output>.stderr` for task logs, or a temporary file for catalog calls and tasks without an output path. Nonempty diagnostic paths are printed and empty files removed. Diagnostics are never parsed as model responses or sent to the browser.
