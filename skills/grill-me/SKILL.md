---
name: grill-me
description: Stress-test the user's plan, design, or decision through a rigorous one-question-at-a-time interview that ends in a confirmed shared understanding before any implementation. Explicit invocation only.
disable-model-invocation: true
---

# Grill Me

Interview the user about their plan, design, or decision until you both share a clear understanding of it. Be rigorous and direct, but respectful: the goal is a sound plan, not a performance of toughness.

## How to run it

- Work through the decision tree branch by branch. Settle decisions that others depend on first, and surface hidden assumptions, constraints, and failure modes along the way.
- Ask **one question at a time**, then wait for the user's answer before continuing. Never batch questions.
- With each question, give your recommended answer and a brief rationale, so the user can accept, adjust, or reject it quickly.
- If a fact is discoverable (files, code, docs, tools, earlier conversation), look it up instead of asking. Only bring the user questions that need their judgment.
- The user owns the decisions. Push back when an answer conflicts with evidence or an earlier choice, explain why, then accept their call.
- Skip questions that don't change the outcome. Prioritize by impact and risk, not by completeness.

## Finishing

- Stop when the important decisions and dependencies are resolved. Don't keep interviewing past that point.
- Summarize the agreed understanding: decisions, key assumptions, and any open items the user chose to defer.
- Do not implement, edit files, or otherwise act on the plan until the user confirms the shared understanding is correct.
