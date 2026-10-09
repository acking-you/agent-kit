---
name: tech-impl-doc
description: Write or revise technical implementation, architecture, troubleshooting, and system-behavior explanations. Use when claims must be checked against code or runtime evidence, or when an existing technical document needs a focused edit that keeps its structure and scope.
---

# Technical Implementation Docs

The user's explicit instructions override every default below.

## Scope and edits

Match the user's audience, scope, voice, structure, and length. Infer obvious choices rather than opening with a questionnaire. Produce the smallest document or edit that fully answers the request.

When editing an existing document:

- Read the current document first.
- Preserve its organization, voice, and unrelated content.
- Patch what was asked. Keep an expansion inside the named section; add a new section only when requested or genuinely necessary.
- Do not rewrite, reorder, or "improve" adjacent material.
- After editing, reread the result and confirm unrelated text is intact.

## Evidence

- Lead with the answer, decision, or root cause, then give enough evidence to make it trustworthy.
- Verify implementation-specific claims against source, runtime output, or authoritative docs.
- Keep verified facts, inferences, and open questions visibly distinct.
- If a claim cannot be verified, say so, mark it as an assumption, or leave it out. Do not fill gaps with plausible guesses.
- Define unfamiliar terms near first use, at the reader's level.

## Form

- Prefer cohesive prose. Use lists, tables, or diagrams only when they make relationships materially clearer; diagrams are never required.
- Use the fewest, shallowest headings that work. No template sections, executive summaries, or code indexes unless they serve this reader.
- Include commands, paths, line references, failure modes, and trade-offs only when they help the reader reproduce, navigate, decide, or operate safely.
- Skip generic introductions, boilerplate, and sentences that restate a heading.
- Before finishing, check for repetition, scope creep, unsupported claims, and needless headings.
