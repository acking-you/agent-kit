# Model routing policy

This skill implements a user preference: Opus for inventive proposals, frontend design and writing; Astra for rigorous review and execution. Neither is assumed infallible. Review facts and test code regardless of family.

As checked on 2026-10-08:

- OpenAI describes [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) as its most capable model for demanding work, including reasoning and coding.
- Anthropic's [Opus 5.5 documentation](https://platform.claude.com/docs/en/models/opus-5-5/overview) identifies the current Opus 5.5 model. Its [Opus page](https://www.anthropic.com/claude/opus) describes improvements in agentic coding and professional work.
- WorkBuddy returned the routing IDs `gpt-6-astra` and `claude-opus-5.5`. These are provider catalog IDs; successful invocation must be tested separately. Do not infer model identity from the model's self-description.

## Selection order

1. Honor an explicit model ID or family requested by the user.
2. For a new session, choose the family matching the task profile.
3. Within that family, prefer the highest available numeric version. Prefer the ordinary ID over a `-1m` variant of the same version unless the user requests the variant.
4. Pass the existing session's exact model ID on resume unless deliberately switching it. Omitting `--model` can reset the native CLI to `auto`; the helper rejects an omitted ID or a family alias on resume.
5. If the required family is absent or inference fails, report the actual cause. Choose another family only when the task or user preference warrants it, not to hide an error.

Model catalogs evolve. Check official guidance when asked for the latest/strongest family; do not assume an unknown future suffix is more capable because it sorts last. The automatic selector recognizes Astra and Opus only. New families can be selected by exact ID after checking availability and suitability.

## Example briefs

**Opus / design:** Propose two interface approaches for the supplied workflow. Explain hierarchy, interaction states, accessibility, and tradeoffs. Work only from the attached requirements; list assumptions.

**Opus / writing:** Draft a technical article from the supplied verified implementation notes. Build a clear narrative, distinguish facts from interpretation, preserve source links, and identify any claims needing verification.

**Astra / review:** Audit the supplied design or article for incorrect claims, omitted edge cases, and contradictions with the source. Prioritize findings and cite the exact evidence. Suggest the smallest corrections that preserve the author's intent.

**Astra / execute:** Implement the bounded change in the assigned checkout. Follow repository instructions, preserve unrelated changes, verify the acceptance criteria, and report modified files, checks, failures, and unresolved issues.
