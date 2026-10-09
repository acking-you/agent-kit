# MyClaude Skills

A small collection of skills and prompts. Copy one instruction below into your agent; it handles installation and verifies the result.

## Skills

### WorkBuddy subagent

Resumable Claude and GPT sessions through WorkBuddy's bundled CLI, with a local live Markdown monitor. Runs at high effort with no imposed turn limit by default; the parent agent periodically checks progress and decides when to intervene. Requires WorkBuddy, an existing login, Python 3.9+ and Node.js 18.20.8+; automatic discovery and native login initialization are currently validated on macOS.

```text
Install workbuddy-subagent from https://github.com/acking-you/myclaude-skills/tree/main/skills/workbuddy-subagent into your supported global skill directory. Fetch the complete folder, including scripts, references and assets. Inspect the instructions, preserve local customizations and machine-local settings, and never import credentials or another installation's consent. Follow references/compatibility.md for native login: reuse this installation's existing authorization; ask only if authorization is missing. Keep authorization outside the skill at ~/.workbuddy-subagent/config.json, bound to the local WorkBuddy data directory. Verify skill discovery and runtime/model availability, then report the installed path and any remaining setup; do not call a model just to prove installation.
```

### Technical documentation

Write evidence-based implementation, architecture and troubleshooting explanations, or make a focused edit without restructuring the rest of a document.

```text
Install tech-impl-doc from https://github.com/acking-you/myclaude-skills/tree/main/skills/tech-impl-doc into your supported global skill directory. Fetch the complete folder, inspect SKILL.md, preserve unrelated skills and local customizations, and verify its name, metadata and discovery. Report the installed path and how to invoke it. Do not create a documentation task during installation.
```

### Grill me

Stress-test a plan through one question at a time, with recommendations, until the important decisions are clear. Explicit invocation only; self-contained.

```text
Install grill-me from https://github.com/acking-you/myclaude-skills/tree/main/skills/grill-me into your supported global skill directory. Fetch the complete folder and preserve its explicit-invocation-only policy and unrelated local settings. Verify it works independently without a separate grilling skill, then report the installed path and how to invoke it. Do not start the interview or implement a plan during installation.
```

## Prompts

These are optional instruction blocks, not skills. Install only the preferences you want. The agent should use its supported instruction mechanism and preserve existing instructions.

### Engineering

Simple implementations, evidence-driven debugging, proportionate validation and concise Chinese handoffs.

```text
Read https://github.com/acking-you/myclaude-skills/blob/main/prompts/CLAUDE.md and install it as my engineering preferences using your supported global instruction mechanism. Inspect existing instructions first; add or update one clearly marked MyClaude Engineering section, preserving unrelated content and my explicit choices. Do not replace the whole file or change tool permissions. Verify the saved section is not duplicated and report its location. If this host cannot persist instructions, say so and provide the reusable prompt instead of inventing a configuration path.
```

### Technical translation

Natural translations that preserve technical meaning, code and structured formats.

```text
Read https://github.com/acking-you/myclaude-skills/blob/main/prompts/TRANSLATE.md and install it as my preferences for technical translation using your supported global instruction mechanism. Scope it to translation requests. Add or update one clearly marked MyClaude Translation section, preserving other instructions and avoiding duplicates. Verify and report its location. If persistent instructions are unavailable, provide the reusable prompt and state that limitation. Do not translate unrelated material during installation.
```

Updates use the same instructions. The agent should compare existing files before applying changes and preserve personal configuration. Repository maintenance and validation guidance is in [AGENTS.md](AGENTS.md).
