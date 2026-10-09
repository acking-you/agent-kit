# Model policy

The user wants the latest, strongest Claude and GPT, not fixed tiers. Successor flagships may use entirely new names.

## Resolve the exact ID

1. Honor an explicit user model or tier. Otherwise use Claude for `brainstorm`, `design` and `writing`, and GPT for `review` and `execute`.
2. Check the current [OpenAI model catalog](https://developers.openai.com/api/docs/models) or [Claude model overview](https://platform.claude.com/docs/en/models/overview). Prefer the highest capability for general reasoning and agentic work over price, speed or release date. Version numbers, suffixes, catalog order and model self-descriptions do not establish capability.
3. Map that model to an exact ID from `workbuddy.py models`; vendor and WorkBuddy spellings may differ. If the mapping is unclear, state the uncertainty.
4. If WorkBuddy lacks the vendor's top model, disclose the gap and name the available model you chose.
5. Pass `--model EXACT_ID` on every `run`. The helper rejects `claude`, `gpt`, `frontier` and `auto` aliases so it never guesses a tier. Without `--model`, a resumed CLI session can silently report `auto`.
6. Record the check date, ID and sources. Reuse for related turns; recheck for a new task or changed catalog/guidance. Keep a conversation's ID on resume unless intentionally switching.
7. An authentication or availability failure is not a reason to downgrade silently.

## Dated evidence (2026-10-09)

This installation exposed and successfully invoked `claude-opus-5.5` and `gpt-6-astra`. They are examples for that setup, not permanent defaults. The Claude overview also listed Fable 5.1, which WorkBuddy's catalog did not expose: vendor lineup and WorkBuddy availability can differ.

## Example briefs

Each brief must stand alone. Fill in context, constraints, allowed files and expected output.

**Claude, architecture or product decision (`brainstorm`):** We must decide [decision] for [goal]. Context: [design, scale, team, deadlines]. Constraints: [hard limits]. Act as a senior thinking partner: recommend one approach, compare at least two credible alternatives, explain tradeoffs and what would change your mind. Name the riskiest assumption and the cheapest way to test it. List factual premises for separate verification and open product questions for the user.

**Claude, design or writing (`design` / `writing`):** Propose two interface approaches for the supplied workflow, covering hierarchy, interaction states, accessibility and tradeoffs. Or: draft a technical article from the supplied verified notes, separating facts from interpretation, preserving source links and flagging claims that need verification. List assumptions.

**GPT, factual investigation (`review`, read-only tools):** Determine whether each claim holds in this workspace: [numbered claims]. Answer true, false or undetermined, citing exact files and lines, reproducible commands or official sources, with confidence. Separate observation from inference. Do not redesign or judge subjective choices.

**GPT, premise check (`review`):** Test the premises, constraints, edge cases and feasibility of the attached proposal. Classify each finding as a falsifiable error (with evidence and the smallest correction) or a subjective concern outside your scope. Do not rewrite the proposal.

**GPT, execution (`execute`):** Implement the agreed plan in the assigned checkout without redesigning it. Follow repository instructions, preserve unrelated changes, verify the acceptance criteria, and report modified files, checks, failures, deviations and unresolved issues.
