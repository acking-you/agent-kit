# Model routing policy

This skill implements the user's practical routing preferences, not universal rankings:

- **Claude family, defaulting to the newest Opus:** a frequent thinking partner for plans, architecture, tradeoffs, product decisions, alternative approaches and subjective judgment. It is also preferred for frontend/UI design, writing, technical blogs, narrative structure and imaginative ideas.
- **GPT family, defaulting to the newest Astra:** factual investigation, validation, correctness checks, reproducible evidence and precise execution of an agreed plan. In the user's experience it is meticulous and dependable with facts but less helpful for subjective ideation.

Neither family is infallible. Astra can state wrong facts, and Opus can be right about them. Verify claims with code, tests and sources regardless of which model made them.

As checked on 2026-10-08:

- OpenAI describes [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) as its most capable model for demanding work, including reasoning and coding.
- Anthropic's [Opus 5.5 documentation](https://platform.claude.com/docs/en/models/opus-5-5/overview) identifies the current Opus 5.5 model. Its [Opus page](https://www.anthropic.com/claude/opus) describes improvements in agentic coding and professional work.
- WorkBuddy returned the routing IDs `gpt-6-astra` and `claude-opus-5.5`. These are provider catalog IDs; successful invocation must be tested separately. Do not infer model identity from the model's self-description.

## Selection order

1. Honor an explicit model ID or family requested by the user. "Claude"/"Opus" maps to `--model claude` and "GPT"/"Astra" to `--model gpt`; each resolves to the family's newest flagship. Other members (Sonnet, Haiku, Sol, Luna, `-1m` variants) are used only when the user names them, by exact catalog ID.
2. For a new session, pass the `--profile` that matches the task. The CLI default is `execute`, so discussions need an explicit `brainstorm` (or `design`/`writing`).
3. Within that family, prefer the highest available numeric version. Prefer the ordinary ID over a `-1m` variant of the same version unless the user requests the variant.
4. Pass the existing session's exact model ID on resume unless deliberately switching it. Omitting `--model` can reset the native CLI to `auto`; the helper rejects an omitted ID or a family alias on resume.
5. If the required family is absent or inference fails, report the actual cause. A family-level preference is not permission to fall back to a smaller tier. Choose another family only when the task or user preference warrants it, not to hide an error.

Model catalogs evolve. Check official guidance when asked for the latest/strongest family; do not assume an unknown future suffix is more capable because it sorts last. The automatic selector recognizes Astra and Opus only. New families can be selected by exact ID after checking availability and suitability.

## Example briefs

Each brief must stand alone: the external session does not see the parent chat. Fill in context, constraints, allowed files and the expected output.

**Opus / plan or architecture discussion (`brainstorm`):** We must decide how to [decision] for [goal]. Context: [current design, scale, team, deadlines]. Constraints: [hard limits]. Act as a senior thinking partner, not a neutral survey. Recommend one approach and compare at least two credible alternatives. Explain the tradeoffs and the conditions under which you would choose differently. List the factual premises your recommendation depends on so they can be verified separately, and flag open product questions for the user.

**Opus / product decision (`brainstorm`):** Given [users, goal, evidence so far], which of [options] should we pursue first? Take a position, explain what we would give up, identify the riskiest assumption, and propose the cheapest way to test it.

**Opus / design (`design`):** Propose two interface approaches for the supplied workflow. Explain hierarchy, interaction states, accessibility, and tradeoffs. Work only from the attached requirements; list assumptions.

**Opus / writing (`writing`):** Draft a technical article from the supplied verified implementation notes. Build a clear narrative, distinguish facts from interpretation, preserve source links, and identify any claims needing verification.

**Astra / factual investigation (`review`, read-only tools):** Determine whether these statements hold in this workspace: [numbered claims]. For each, answer true, false or undetermined. Cite exact files and lines, commands you could reproduce, or official sources, and state your confidence. Separate observed facts from inference. Do not redesign or judge subjective choices; report evidence, contradictions and missing information only.

**Astra / plan premise check (`review`):** Test the factual premises, constraints, edge cases and feasibility of the attached proposal. Classify each finding as a falsifiable error (with evidence and the smallest correction) or a subjective concern outside your scope. Do not rewrite the proposal or replace its recommendation.

**Astra / review (`review`):** Audit the supplied design or article for incorrect claims, omitted edge cases, and contradictions with the source. Prioritize findings and cite the exact evidence. Suggest the smallest corrections that preserve the author's intent.

**Astra / execute (`execute`):** Implement the agreed plan in the assigned checkout without redesigning it. Follow repository instructions, preserve unrelated changes, verify the acceptance criteria, and report modified files, checks, failures, deviations from the plan, and unresolved issues.
