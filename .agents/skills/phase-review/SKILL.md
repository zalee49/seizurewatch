---
name: phase-review
description: >-
  Review a finished roadmap phase end to end -- content, wiring and bugs --
  knowing its tasks were likely built by several different agents and models,
  fix what the review finds, and reply with a letter grade and the list of
  bugs found and fixed. Fire on "review phase 2", "review <codename> phase 3",
  "phase review", "review the phase", "grade the phase", "how did phase N come
  out", "close out phase N", "landing review of <task ID>", "review <task ID>
  before the next task starts", or when a roadmap's `### Phase N review`
  checkbox is the next open item. Reads the roadmap as the contract, fixes
  local findings as `<task ID> fix (Fn)` commits, and never touches a
  deployment, a migration already applied, or stored production data without
  the operator's yes.
---

# Phase review

The review gate from the roadmap skill (`.agents/skills/roadmap/SKILL.md` §Phase review). The roadmap is the contract. The phase's commits are the thing under review. The reply is a grade and a findings table.

Assume the phase was built by **several agents, often different model families, each of which saw only its own task**. Most defects in a phase built this way sit where one task hands something to another: a field one task writes and another reads, a unit one assumes and another doesn't, a helper two agents each wrote their own way. Review for those first.

If you built any task under review, say so on the reply's first line. Your review of your own work is weaker, and the operator may want another model to run it.

Project specifics (test runner, lint and type-check commands, deploy target) come from `AGENTS.md`.

## 1. Phase review or landing review

| Kind | When | What runs |
| :-- | :-- | :-- |
| **Phase** | A phase's `### Phase N review` box is open, or the operator names a phase. | Sweep, Content, Wiring and Bugs across the phase. Graded. |
| **Landing** | One task is named: a `Depends on: … after landing review (<reason>)` line the roadmap author wrote, or the operator's words. The rare case: the roadmap skill makes the phase review the default and a `[boundary]` tag alone never adds one. | Sweep, Content and Bugs on that task, plus the interface it publishes checked against its **What to build** text. No grade, no phase checkbox. |

A phase review still runs Wiring and Bugs on a task that had a landing review: a landing review sees one task, so it misses the seams. It skips only Content on that task, and only for commits the landing review saw.

**A second pass** by another model family runs only when this pass itself found a Critical or three or more Major. Say so in the reply; do not start it yourself.

**Roadmaps that predate the standard** may lack the `[boundary]` tag and the **Inputs** block. Treat a task as `[boundary]` when it touches persisted state, schemas, identity keys or external services. Where a task has no **Inputs** block, list its inputs yourself from the code before the Bugs pass.

## 2. Scope

1. **Find the roadmap and phase.** The operator names them ("review <codename> phase 2"). Otherwise take the roadmap in `Roadmap/` whose `### Phase N review` checkbox is the first unticked one after a fully ticked phase. Read the phase section: each task's `Builds:`, **Inputs**, **What to build**, **Tests.**, `Acceptance:` and **As built**, the decisions those tasks cite, and the Non-goals appendix. Outside the phase, read only the **As built** of earlier-phase tasks named on a `Depends on:` line.
2. **Find the commits.** `git log --oneline --grep "<PREFIX>N\."` plus any `<ID> fix (Fn)` commits already present. Other work may be interleaved on the branch, so **do not review a naive `A..B` range**. Build the file list from the phase's own commits (`git show --stat <sha>` each) and review those changes.
3. **Name the builders** from each task's **As built** or the commit's `Co-Authored-By` trailer. Write `unknown` where neither says.
4. **Map the seams.** List every task pair where one `Depends on:` the other, both touch one module, or one writes something (a record field, a database column, an API response, a component prop, a function) the other reads. Include producers from earlier phases: a task that reads an earlier phase's output is a seam, and the producing code is read, not its description.

A phase whose diff exceeds roughly 2,000 changed lines may split the passes across up to three read-only subagents, each returning findings with `file:line` and a reproduction. Verify every finding they return yourself, and run `git status --short` afterwards: a read-only probe can still change files.

## 3. The passes

Run them in this order. The sweep is minutes of `rg` and catches whole classes before any code is read closely.

### Sweep — the mechanical checks

- **Every ticked checkbox has its evidence.** The test a box names exists and passes when run. An `Acceptance:` ticked before the observation it names is a finding.
- **Every `Reachability:` home exists:** the route, nav entry or button for `ui`; the `package.json` script and its README line for `script`; the schedule config for `scheduled`; the trigger phrase in the named skill's `description` for `skill`; the `AGENTS.md` bullet or printed warning for `standing`.
- **Every Inputs failure result has its test case**, and the test fails closed the way the line says.
- **Text elsewhere still matches.** `rg` the phase's changed command, route, field and setting names across `.agents/skills/`, `AGENTS.md`, `docs/` and the README. A skill step or doc line that describes the old behaviour is a finding.
- **Plumbing a task-by-task build misses:** a schema change has its migration committed; a new environment variable is in `.env.example` and documented; a version the plan requires is bumped.
- **As built names a builder** for every task.

### Content — did each task build what it says?

- Each task's `Builds:` sentence and `Acceptance:` hold in the code, not only in the **As built** prose.
- **As built matches the code.** A note describing an interface, count or behaviour the code doesn't have misleads every later task that reads it.
- Tests pin the contract the task names. A test that asserts the implementation back at itself pins nothing.
- Nothing outside the task's scope or the plan's Non-goals crept in.

### Wiring — do the pieces connect?

Walk the seam list first, then:

- **Producer against consumer**, for every seam: names, types, units (mg or ml, seconds or minutes), local date or UTC instant, `null` and missing handling, ordering. Check client and server agree on the shape. Read both sides. Do not trust either task's description of the other.
- **New code is on a live path.** Every new function, field, route or component has a production caller, not only a test caller (LSP `findReferences`, else `rg`). A value computed and never shown or persisted is dead, and a checkbox that promised it is unevidenced.
- **Duplicates.** Two agents solving one problem twice (two date formatters, two validation schemas for one record, two constants for one threshold). Keep one.

### Bugs — is it correct?

Hunt for wrong results on reachable inputs as any review would, on every task, landing-reviewed or not. Look first where Critical and Major findings most often hide in work built this way:

1. **Fail-open inputs.** A missing, partial, conflicting or malformed input that still reaches the output or the database as a value. It must fail closed (roadmap skill, Planning rule 3). Check every Inputs line, then look for inputs the task never listed. Validation that runs only in the browser does not count.
2. **Time and dates.** Local date against UTC instant, events near midnight, daylight-saving changes, a device in another time zone. A record that lands on the wrong day corrupts every trend built on it.
3. **Units and double counting.** A dose in the wrong unit, a total against an average, a record counted twice across a join or a merged list.
4. **Dishonest counts.** A denominator, average or "n of m" that includes rows it should not, or hides the excluded ones; a chart whose empty days silently vanish.
5. **Old records under new rules.** Records written before this phase read or displayed under a new schema or meaning instead of the one they were saved with.
6. **One bad row kills the page.** A malformed record that throws out of a render or a loop and hides every other row.
7. **Retries, duplicates and concurrent edits.** A double-tap or retried request that saves a second record; two people editing the same record at once, one silently overwriting the other.
8. **The boundary checklist** for every `[boundary]` task (roadmap skill, Planning rule 5).

**No finding without a reproduction.** Confirm each one with a focused test, a probe script in the scratchpad, or a line-by-line trace cited with `file:line`. What you can't reproduce is reported as *plausible*, never fixed on speculation.

## 4. Severity

Severity follows where the wrong value can travel, not how alarming the bug looks.

- **Critical:** stored data lost or corrupted; a wrong record or number the operator would act on (a dose, a date, a count) with no way to notice; a validation or access gate weakened.
- **Major:** a wrong result on a reachable input; a capability with no working home; a seam mismatch; a checkbox or `Acceptance:` ticked without its evidence.
- **Minor:** an unlikely edge case, misleading output or note text, dead code, a duplicate helper.
- Nits (naming, formatting) are not findings and do not affect the grade.

## 5. Fix

Number findings `F1`, `F2`, … starting at the phase's highest existing F-number plus one, landing reviews included. Never renumber a recorded finding; cite a finding as `<task ID> Fn`.

**Fix it yourself** when the fix is local to the owning task's scope:

- Extend the nearest existing test so it fails on the bug, then fix the code. Run only that test file, then the lint and type-check commands `AGENTS.md` names.
- Record it in the owning task's **As built** in one line: `Review fix Fn (YYYY-MM-DD): <what was wrong, what it does now>`.
- Commit once per task, covering all its findings, as `<task ID> fix (Fn, Fm): <plain summary>`, after `git status --short`, on the current branch. On the default branch, ask the operator first.

**Report it, don't fix it**, and mark it *needs you*, when the fix:

- changes or deploys anything in production, or writes to stored production data;
- changes an operator decision (`<PREFIX>-Dn`), a migration already applied, or a record format already persisted;
- needs a redesign across tasks rather than a local change; or
- touches secrets, credentials or access control.

Minor findings that are cheap to fix get fixed. Minor findings that aren't are listed as open. A dismissed finding gets one line saying why.

**Close the review** in the same commit as the last fix, or on its own if nothing needed fixing:

- *Phase review:* tick the `### Phase N review` checkbox and write one record line under it: date, reviewer model, grade, F-range, anything open. Leave the box unticked, and the phase open, if a *needs you* finding is Critical or Major, or if this pass calls for a second pass. The second pass ticks it.
- *Landing review:* add one line to the task's **As built**: `Landing review (YYYY-MM-DD, <model>): F-range, <all fixed | Fn open>`.

The roadmap gets those lines and nothing more. No verification narrative and no test counts; the reply and the commits carry the detail.

## 6. Grade

Phase reviews only. Grade **the phase as its builders delivered it**, before any review's fixes: count every F-number the phase carries, landing reviews and earlier passes included. The grade measures how the build went.

| Grade | Delivered code |
| :-- | :-- |
| **A** | No Critical or Major. At most two Minor. Content complete, every home wired. |
| **B** | No Critical. One or two Major, each fixable locally, or several Minor. |
| **C** | Three or more Major; or one Major that needs a redesign or the operator; or a ticked checkbox with no evidence behind it. |
| **D** | One Critical, or a whole task's deliverable missing or unreachable. |
| **F** | The phase doesn't do what its `Builds:` lines say, more than one Critical, or a safety boundary broken. |

Use `+` or `−` within a band when the findings sit near its edge. Say which row decided the grade.

## 7. Reply

Write for a narrow terminal and a non-technical reader. Short paragraphs, one
idea each. Say what went wrong in terms of what the operator would see, not in
symbol names. Never use a Markdown table for the findings: prose in table cells
wraps into unreadable ragged rows. A landing review uses the same shape with
`<task ID> landing review` in place of the grade heading and no grade.

Keep it to this shape:

```markdown
## Verdict: <grade>

<One or two plain sentences: what the grade means, and which rubric row
decided it.>

**Anything need you?** <What the operator must decide or do, or "Nothing."
Name any open *needs you* finding here, before the detail.>

## What I found

**F1 — <short plain headline> (<task ID>, <severity>, fixed)**
<One or two short sentences: what the operator would have seen, and what
happens now. Name the fix commit if there is one.>

**F2 — <short plain headline> (<task ID>, <severity>, open)**
<One or two short sentences. If open, say why and what it would take.>

## The rest, briefly

- **Content:** <one line>.
- **Wiring:** <one line>.
- **Bugs:** <one line: the findings above, nothing else>.
- **Checks:** <tests, lint and type-check, each as its own short item or one
  short line each — results, not narrative>.
- **Built by:** <ID> <model>, <ID> <model>, …
- **Roadmap:** <review box ticked, or left open and why>.
- <Second pass needed: this pass found a Critical or three Major — or omit
  this line.>
```

If there were no findings, say so plainly under the verdict and give the
grade. Don't pad the findings section.
