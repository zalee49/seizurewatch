---
name: roadmap
description: Author, structure, update, or audit roadmap and planning documents following the repository's execution-ready standard. Use whenever creating new roadmaps, breaking down complex initiatives into phased plans, sizing tasks so one agent can take each, or auditing roadmap task formats.
---

# Roadmap Authoring Standard

An execution-ready plan: an agent follows it without guessing scope, ordering, verification, or stop conditions. Roadmaps live in `Roadmap/<name>.md`. The template at the end of this file is the canonical format; do not copy the shape of an older roadmap that predates it.

Project specifics a roadmap relies on (stack, commands, test runner, deploy target) come from `AGENTS.md`. Cite them there rather than restating them in each plan.

## Who reads a roadmap

- **A cold, cheaper executor.** Each task is picked up by a fresh agent, often a smaller model and often a different family from its siblings' builders, that has read nothing else in the plan. The author does the thinking up front: exact file paths and symbols, signatures, data shapes, edge cases, verification commands. Nothing is left as an exercise.
- **The people who use what gets built.** Every capability a roadmap adds needs a way for its user to reach it (the `Reachability:` line below). A feature nobody can find, or a script nobody knows to run, has not landed.

---

## Authoring pass

Write the plan in this order. Each early step is cheap to redo; a finished long document is not.

1. **Recon once.** One bounded pass over the code and docs the plan touches. What it finds lands in the baseline section or a task's **What exists**, so no executor repeats it.
2. **Decisions in one batch.** List every operator decision the plan depends on before any task is written. Record each as `<PREFIX>-Dn`. Put them to the operator with the `inquisition` skill, one at a time, in blocking order.
3. **Skeleton first.** Phases, task IDs, each task's `Builds:` sentence and relationship lines, the seams (what one task writes that another reads), and the rare task whose landing review is absolutely necessary, with its reason. No task bodies yet. Run the audit checklist on the skeleton, where a fix is one moved line.
4. **Fill the bodies.** With the seams written down, task bodies are independent of each other. A plan of more than about ten tasks may be filled phase by phase by parallel subagents, each given the skeleton, the recon and this file.
5. **Audit again**, then stop. Writing a roadmap is not a go-ahead to build it.

### Audit checklist

The same list serves the skeleton check, the final check, and an "audit this roadmap" request.

- The synopsis under the title is plain language, two or three sentences, and still matches the plan's scope.
- Every task has `Parallel:`, `Depends on:`, `Builds:` and `Acceptance:`; a task that delivers something a user has to invoke or navigate to has `Reachability:`.
- No task depends on a higher-numbered sibling. `Parallel:` names same-phase siblings only.
- Two tasks in one phase that name the same module are merged, or the later one carries the stated seam. "Shared module; build in ID order" alone is a sizing defect.
- Calendar-bound tasks sit as early as their dependencies allow, with a stated duration (rule 9) and an emitter trace (rule 10).
- Every task that reads external or user-entered input has an **Inputs** block. Every task that writes persisted or shared state, changes a schema, or computes an identity key is tagged `[boundary]`.
- Every phase that lands code ends with a review block. A landing review appears only where the author wrote, on the dependent's `Depends on:` line, why the phase review would come too late; a `[boundary]` tag or a same-phase dependent alone does not add one.
- The size budgets below hold.

---

## Document shape

Sections, in order; omit any that do not apply.

1. **Title, synopsis and metadata block.** The synopsis sits directly under the title: two or three plain-language sentences saying what the plan builds or finds out, and why, for a reader who has never seen the repo. No codenames, task or decision IDs, file paths or jargon; those belong in the metadata block and below. Rewrite it when the plan's scope changes. The metadata block follows: date, status, goal, runtime boundary, safety boundary.
2. **How to read this plan:** phase-ordering rationale, where the numbers come from, and anything this plan does differently from this standard. Beyond the template's executor lines, do not restate the standard.
3. **Decisions the plan assumes:** `<PREFIX>-Dn`, each with evidence and operator sign-off.
4. **Baseline evidence:** what happens today and why, with tables where they help.
5. **Targets:** metric, baseline, target, measurement method. Omit for plans with no measurable target.
6. **Ordered phases:** each with an effort and payoff line and numbered tasks.
7. **Observation phase:** watch periods or evidence collection that span sessions.
8. **Appendices:** non-goals, scope bounds, files and systems in scope.

### Size budgets

A roadmap is read many times: by every executor, by every reviewer, and at every update. Keep it small enough to be read.

- **Evidence once.** Tables and measurements live in the baseline section; tasks cite them and do not repeat them.
- **A task spec is about 600 words.** Past roughly 1,000, the task should split along a seam, or its **What exists** is re-deriving the baseline.
- **As built is about five lines per task**, plus one line per review or review fix: builder model and date; any deviation from the planned interface; the checks run; the acceptance evidence where `Acceptance:` asks for it to be recorded. No test counts and no narrative of what was verified. The commit message and the tests hold those.
- **A review record is one line** under the phase's review checkbox (see Phase review).

---

## Task format

Every task gets a stable phase-scoped ID and an action-oriented heading. A task that writes persisted or shared state, changes a database schema, computes or checks an identity key, or calls an external service that changes something adds the `[boundary]` tag. Reading data is not enough to earn it; the **Inputs** block covers reads:

```markdown
### L1.3 — Show the last 30 days of events on a timeline
### L1.4 [boundary] — Store medication doses alongside each event
```

### Task sizing: one task, one agent

A task is the unit the operator dispatches. One agent takes it from first read to commit with no handoff in the middle. Size by coupling, not by feature list.

- **Coupled work is one task.** Two pieces of work that edit the same module, or where one defines an interface (a signature, a schema, a record field, an API response another parses) that the other consumes, share a task with a checkbox each. Splitting them hands a half-understood interface to a different agent, and the mismatch surfaces only at review, after later work is built on it.
- **Upper bound: one agent session.** One subsystem, about 3–8 checkboxes, a handful of source files plus their tests. Bigger than that, split along a seam, never down the middle of an interface.
- **A split states the seam.** The earlier task's **What to build** writes the interface out in full (signature, fields, error cases). The later task's **What exists** repeats it verbatim and `Depends on:` the earlier one. Each agent builds against the text, not against a guess about the other's code.
- **Lower bound: worth a fresh agent.** One small checkbox that shares a file with a sibling merges into that sibling.
- **The task body is the agent's recon.** **What exists** cites every file and symbol the agent needs, so it reads those and nothing else. The executor lists the headings with `rg -n "^### " Roadmap/<file>.md`, reads its own task from its heading to the next one, and reads four other things: **How to read this plan**, the decisions the task cites, the Non-goals appendix, and the **As built** notes of the tasks on its `Depends on:` line. It does not read the rest of the roadmap or sibling tasks.

### Relationship lines

```markdown
- **Parallel:** L1.1, L1.2. **Depends on:** L0.3; operator decision L-D1.
- **Reachability:** ui — "History" tab in the main nav.
```

- **`Parallel:`** names same-phase siblings that can proceed independently, or `nothing`. The operator runs one phase at a time, so a cross-phase claim is noise. It means logical independence, not permission to edit one file concurrently: tasks that share a module are not parallel.
- **`Depends on:`** names the decisions, tasks or evidence that must be complete first, from any phase, or `nothing`. A conditional task states its gate here and repeats it in the heading or opening sentence.
- **`Reachability:`** is required when the deliverable is something a person has to find or invoke: a page or control, a script, a recurring job. Name exactly one home and state it concretely:
  - `ui`: where it sits in the app (the route, nav entry or button a user taps).
  - `script`: a `package.json` script (or the stack's equivalent) with a line in the README's commands section.
  - `scheduled`: a cron, scheduled function or CI job, naming its config file and cadence.
  - `skill`: a trigger phrase in an `.agents/skills/*` `description`, in the operator's words.
  - `standing`: an `AGENTS.md` bullet, or a warning printed by a command the agent already runs.

  **A capability with no home is not landed.** The task stays unticked until the home exists. When a later task in the same phase builds the home, write `Reachability: via <later ID>`; the capability's task may then tick, and the later task carries the home. Omit the line only for a pure internal change.
- **Number tasks in dependency order within a phase.** If a draft has a task depending on a higher-numbered sibling, swap the IDs before publishing and note the swap in **How to read this plan**.

### Task body

In this order:

- **Builds.** One plain sentence naming the thing that exists when the task is done. Name the product, not the steps: "After logging a seizure, you can see how long it has been since the previous one." No paths, symbols or checkbox lists. A watch task names the evidence it produces. If the sentence needs the heading's jargon to make sense, rewrite it.
- **What exists.** The current code, artifact or behaviour that sets the starting point, with file paths and symbol names.
- **Inputs.** Required on any task that reads external data, user-entered data, or stored records to produce something a person relies on. One line per input: its source, and what the output does when that input is missing, stale, malformed or conflicting. The default is fail closed: the record is refused or clearly labelled, never silently defaulted to a value. Each distinct failure result gets one test case; inputs that fail the same way through the same code share a case. Written here, the builder closes these gaps instead of the reviewer discovering them.
- **What to build** or **What to do.** Small checkboxes, each independently verifiable.
- **Tests.** The focused test file or function, or the manual check. Extend the nearest suitable test rather than adding a sibling. A new or changed test names the existing coverage it extends, the unique risk the new case covers, and the focused command that runs it. Documentation, prose and reversible cosmetic edits earn no test.
- **Acceptance.** The concrete artifact, command output, screenshot or operator observation that proves the task complete.
- **As built.** Written at landing, inside the size budget above. It must record any change to an interface a later task consumes, and name the model that built the task so the operator can pick a reviewer from a different family where one is available.

---

## Checkbox lifecycle

- **Checkboxes are the source of truth.** Flip `- [ ]` to `- [x]` in the same diff as the verified work.
- **Never flip a box before its evidence exists.** A code edit without its designated test or observation is not evidence.
- **Commit after each task**, once verified and ticked, before starting the next. Read `git status --short` first and leave out what plainly doesn't belong. Commit on the current branch; on the default branch, only with the operator's go-ahead. One task per commit keeps the checkboxes and the history in step and makes a bad task reversible on its own. The commit ends the builder's work on that task; review is the operator's call (Phase review).

---

## Phase review

Per-task tests cannot see the seams between tasks, or drift between what **As built** says and what the code does. An independent review, by a model family that built none of the work where one is available, catches both. The roadmap decides only where reviews go; the operator picks the reviewer and tool (for example `/code-review`, or an independent reviewer agent given the phase's diff).

- **The operator dispatches every review; a builder never starts one.** A builder lands its task (tests, checkbox, **As built**, commit) and stops. It does not run a reviewer, a review skill or a review subagent on its own work, and does not fix findings nobody has raised. The `[boundary]` self-probe (Planning rule 5) is part of building, not a review, and still runs. When a review is the next open item, the builder's reply says so in one line and names the models that built the work under review.
- **Landing review: only when absolutely necessary; the phase review is the default.** The phase review already covers every task for wiring and bugs, so a landing review is an extra pass over the same code. The author adds one only when a defect in the task would be expensive to undo by the time the phase review runs: a sibling in the same phase will write persisted state or records on top of the task's interface, and reverting that sibling would mean migrating or deleting what it wrote. Anything the phase review can still catch and the builder can still fix in place does not qualify, `[boundary]` tag or not. Where one is necessary, the dependent's line reads `Depends on: L1.4 after landing review (<why the phase review is too late>)`, and the reason is part of the line. No reason, no landing review.
- **Phase review: once per phase that lands code, on the phase's own commits.** This is where review happens. The next phase does not open until its checkbox is ticked. A phase of decisions, watches or prose has no review block.
- **One pass, unless it found a lot.** A second pass by another reviewer runs only when the first pass found a Critical or three or more Major findings.
- **Finding numbers run on within a phase.** Each review starts at the phase's highest `F` number plus one, landing reviews included. Cite a finding as `<task ID> Fn`.
- **The review record is one line** under the checkbox: date, reviewer model, grade, F-range, and anything left open. Each fix is one line in the owning task's **As built**. The reply and the fix commits carry the detail.

```markdown
### Phase 2 review

- [ ] Independent review by a reviewer the operator chooses, from a model family that built none of Phase 2 where one is available.
```

---

## Planning and safety rules

Other documents cite these by number. Do not renumber them.

1. **Ordering logic.** Order phases by a stated rationale: user payoff per line of code, risk reduction, prerequisite evidence.
2. **Boundary separation.** Operator decisions, implementation, deployment, operational acceptance and multi-session watches are separate; one does not imply the next. Scope it to real blast radius: deploying to production, migrating or deleting stored data, merges, pushes, PRs, history rewrites, overwriting a value that already differs on disk. Do not spend a turn separating an approval from the write it authorizes.
3. **Safety boundaries.** Preserve data integrity, validation and fail-closed behaviour. A speed or convenience target is never permission to weaken a check or risk losing stored records.
4. **Data honesty.** Label numbers as measured, estimated or hypothesized. Name the source and how future work will verify the claim.
5. **Edge cases and failures.** Make failure behaviour and stop conditions explicit for missing, stale, malformed, partial or conflicting inputs; the task's **Inputs** block is where they are written. A `[boundary]` task also carries the boundary checklist, and its builder self-probes it before committing: schema changes are migrations, not hand edits; writes are idempotent where a retry or double-tap can repeat them; identity keys exclude wall-clock metadata; write-once targets are pre-flighted before the first write; dedup identity is order-insensitive; failure messages name exactly what was and was not saved.
6. **Non-goals.** Keep them visible so parallel work does not expand a task's authority.
7. **Test discipline.** Run only the test file or function touched, using the focused command `AGENTS.md` names. Do not run the full suite to land one task.
8. **Executor clarity.** Fully specify target interfaces, signatures, error branches and acceptance checks (see Who reads a roadmap).
9. **Schedule the longest-lead item first.** Find every task bounded by calendar time or outside evidence (multi-session watches, collecting real usage, waiting on a third party) and place it as early as its dependencies allow, with code work beside it rather than ahead of it. State its expected wall-clock duration so the critical path is visible.
10. **Verify the evidence is reachable before planning to collect it.** For any task whose acceptance depends on data the system must produce (logged records, events, samples), trace the code that produces it, confirm it can fire under current state, and record the trace in **What exists** with file and symbol names. An observation task whose input cannot be generated is blocked, not slow, and the roadmap says so.
11. **Usable on the day it lands.** Every capability is reachable when it ships: a `Reachability:` home, and for anything the agent runs, the exact command and the operator's trigger sentence (see Who reads a roadmap).

---

## Template

```markdown
# <codename>: <Action-oriented plan title>

<Synopsis: two or three plain-language sentences on what this plan builds or finds out, and why.>

> **Date:** YYYY-MM-DD.
> **Status:** Proposed | In progress | Completed.
> **Goal:** <One or two sentences stating the measurable objective.>
> **Runtime boundary:** <Local only, preview deploy, or production.>
> **Safety boundary:** <What must not break: stored data, validation, operator authorization.>

---

## How to read this plan

- **Each task is one agent's assignment**, start to commit. List the headings with `rg -n "^### " Roadmap/<file>.md` and read your task to the next heading, this section, the decisions your task cites, the Non-goals appendix, and the **As built** of your `Depends on:` tasks. Nothing else.
- **Landing a task:** run only the test file you touched (focused command in `AGENTS.md`), flip its `- [ ]` to `- [x]` in the same diff, write **As built**, and commit before the next task. Format and rules: `.agents/skills/roadmap/SKILL.md`.
- **No self-review.** After the commit, stop. Do not run any reviewer on your work; the operator chooses who reviews, and when.
- **Phases are ordered by** <payoff, risk, prerequisite chain>.
- **Where numbers come from:** <data files, timings, measurements>.
- **Differs from the standard:** <anything, or omit this line>.

---

## 0. Decisions this plan assumes

### <PREFIX>-D1 — <Decision title>

- **Proposed:** ...
- **Evidence:** ...
- **Decision and rationale:** ...

---

## 1. Baseline evidence and targets

<Summary table or timeline of current behaviour.>

| Metric | Baseline | Target | Measurement method |
| :-- | :-- | :-- | :-- |
| ... | ... | ... | ... |

---

## Phase 1 — <Phase name>

<One line: effort and payoff.>

### <PREFIX>1.1 [boundary] — <Action-oriented task name>

- **Parallel:** <same-phase IDs, or nothing>. **Depends on:** <IDs or decisions from any phase, or nothing>.
- **Reachability:** <ui | script | scheduled | skill | standing> — <the route, script, schedule, trigger sentence, or rule>.
- **Builds:** <One plain sentence: the thing that exists when this task is done.>
- **What exists.** <Current state, with file paths and symbols.>
- **Inputs.**
  - <input> — <source>. Missing: <result>. Stale: <result>. Malformed: <result>.
- **What to build.**
  - [ ] <Small independently verifiable change.>
  - [ ] <Failure handling for each Inputs line.>
- **Tests.** <Focused test command; coverage extended, risk covered.>
- **Acceptance:** <One concrete, observable completion condition.>

### Phase 1 review

- [ ] Independent review by a reviewer the operator chooses, from a model family that built none of Phase 1 where one is available.

---

## Appendix: Non-goals

- <Explicit out-of-scope items.>
```

Drop `[boundary]`, `Reachability:` and **Inputs** from a task they do not apply to.
