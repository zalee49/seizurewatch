---
name: inquisition
description: >-
  The standard format for any decision the agent puts to the operator. Use
  whenever you are about to ask the operator to choose between approaches,
  settle a design or scope question, or approve one path over another while
  building in this repo -- and on "ask me properly", "give me the options",
  "what are my choices", "inquiry format". A short context, the question, the
  options with the case for each, and the agent's recommendation.
---

# Inquisition

Every decision put to the operator uses one shape, so they can read it in seconds and answer with a letter.

## When it applies

Any time you stop to ask the operator to choose: an approach, a scope cut, a design trade-off, which of two readings of a request they meant. Before asking, check the question is really theirs: if the code, the roadmap or a sensible default answers it, act and say what you picked instead of asking.

It does not cover a plain yes/no on an action the rules already gate (pushing, merging, deploying, deleting data). Those stay one-line confirmations.

## The format

```markdown
### Decision: <a few words naming it>

**Context.** <One to three plain sentences: what you are building, and what you ran into that needs a call. No file paths, IDs or jargon unless the decision turns on them.>

**Question.** <One sentence, ending in a question mark.>

**Options**

- **A. <short name>.** <Why this option would make sense: the situation it fits and what it buys. One to three sentences.>
- **B. <short name>.** <Same.>
- **C. <short name>.** <Same.>

**Recommendation: <letter>.** <One or two sentences: why this one wins here, naming what tips it over the others.>
```

## Rules

1. **One question at a time.** When several decisions are open, ask only one per message: the one that blocks the others, or the most consequential if none does. End it with one line saying how many more are queued (`2 more decisions after this one.`), then wait. Ask the next only after the answer, and drop or rewrite any queued question that answer settled or changed.
2. **Two to four options**, mutually exclusive, so a single letter is a complete answer. If "do nothing" or "defer it" is a real choice, list it as an option.
3. **Argue for every option.** Each option's line is the best honest case for it, not a strawman set up to lose to the recommendation.
4. **Always recommend.** Pick one letter. If you genuinely cannot, say what fact would decide it and recommend the option that is cheapest to undo.
5. **Brief.** Context is at most three sentences; the whole block should fit on a phone screen. Detail the operator might want goes in a linked file, not the block.
6. **Nothing after the block** except the queued-count line from rule 1 and, if useful, one line saying what you will do once they answer. Then stop and wait.
7. **Their answer is final for that decision.** Do not re-ask it later in the session unless something new changes it, and say what changed.
