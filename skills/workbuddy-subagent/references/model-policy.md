# Model routing policy

The user wants the latest, strongest Claude and the latest, strongest GPT, not permanently named tiers. Names such as Opus and Astra describe the current tested models; successor flagships may use entirely different names.

- **Claude:** a frequent thinking partner for plans, architecture, tradeoffs, product decisions, alternative approaches and subjective judgment, as well as frontend/UI design, writing and technical blogs.
- **GPT:** factual investigation, validation, correctness checks, reproducible evidence and precise execution of an agreed plan. The user finds it meticulous with facts and less useful for subjective ideation.

These are workflow preferences, not guarantees. Verify factual claims from either family with code, tests and sources.

## Resolve names from current evidence

1. Honor an explicit model request. Otherwise choose Claude for `brainstorm`, `design` or `writing`, and GPT for `review` or `execute`.
2. Read the current [OpenAI model catalog](https://developers.openai.com/api/docs/models) or [Claude model overview](https://platform.claude.com/docs/en/models/overview), opening the relevant model's official page when needed. Consider the vendor's full current lineup, including new flagship names. Prefer the highest capability for general reasoning and agentic work, not the cheapest, fastest or merely most recently released variant.
3. Query `workbuddy.py models` and map the chosen model to an exact WorkBuddy ID. Vendor API spelling and WorkBuddy spelling may differ. Do not infer capability from regexes, numeric sorting, naming familiarity, catalog order or model self-description.
4. Select the strongest model actually available through WorkBuddy. If its catalog lacks the vendor's top model, disclose that availability gap and the chosen available model; never call that choice the vendor's overall strongest without evidence. If the mapping or ranking is unclear, state the uncertainty instead of inventing one. Preserve an explicitly requested model rather than replacing it silently.
5. Pass `--model EXACT_ID` on every `run`; `--profile` describes task intent and does not select a model. The helper deliberately rejects ambiguous `claude`, `gpt`, `frontier` and `auto` aliases. This lets newly named flagships work without changing selector code.
6. Record the check date, exact ID and supporting sources in the parent task. Recheck on a new task, changed catalog or changed official guidance; reuse the decision for related turns. Keep an existing conversation's exact ID on resume unless intentionally switching models.
7. Verify successful inference and the reported model. An authentication or availability failure is not a reason to downgrade silently.

## Dated compatibility evidence

On 2026-10-09, this installation exposed and successfully invoked `claude-opus-5.5` and `gpt-6-astra`. These remain suitable choices for the current tested setup; they are not permanent constants or evidence of an all-time ranking. The vendor model lineup and WorkBuddy's accessible subset can differ. For example, the current Claude overview also lists Fable 5.1 for demanding reasoning, while this installation's catalog did not expose a Fable ID. Use the fresh evidence and available catalog when choosing, rather than treating "Claude" as a synonym for "Opus".

## Example briefs

Each brief must stand alone: the external session does not see the parent chat. Fill in context, constraints, allowed files and the expected output.

**Claude / plan or architecture discussion (`brainstorm`):** We must decide how to [decision] for [goal]. Context: [current design, scale, team, deadlines]. Constraints: [hard limits]. Act as a senior thinking partner, not a neutral survey. Recommend one approach and compare at least two credible alternatives. Explain the tradeoffs and the conditions under which you would choose differently. List the factual premises your recommendation depends on so they can be verified separately, and flag open product questions for the user.

**Claude / product decision (`brainstorm`):** Given [users, goal, evidence so far], which of [options] should we pursue first? Take a position, explain what we would give up, identify the riskiest assumption, and propose the cheapest way to test it.

**Claude / design (`design`):** Propose two interface approaches for the supplied workflow. Explain hierarchy, interaction states, accessibility, and tradeoffs. Work only from the attached requirements; list assumptions.

**Claude / writing (`writing`):** Draft a technical article from the supplied verified implementation notes. Build a clear narrative, distinguish facts from interpretation, preserve source links, and identify any claims needing verification.

**GPT / factual investigation (`review`, read-only tools):** Determine whether these statements hold in this workspace: [numbered claims]. For each, answer true, false or undetermined. Cite exact files and lines, commands you could reproduce, or official sources, and state your confidence. Separate observed facts from inference. Do not redesign or judge subjective choices; report evidence, contradictions and missing information only.

**GPT / plan premise check (`review`):** Test the factual premises, constraints, edge cases and feasibility of the attached proposal. Classify each finding as a falsifiable error (with evidence and the smallest correction) or a subjective concern outside your scope. Do not rewrite the proposal or replace its recommendation.

**GPT / review (`review`):** Audit the supplied design or article for incorrect claims, omitted edge cases, and contradictions with the source. Prioritize findings and cite the exact evidence. Suggest the smallest corrections that preserve the author's intent.

**GPT / execute (`execute`):** Implement the agreed plan in the assigned checkout without redesigning it. Follow repository instructions, preserve unrelated changes, verify the acceptance criteria, and report modified files, checks, failures, deviations from the plan, and unresolved issues.
