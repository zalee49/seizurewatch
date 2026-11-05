# Day views: A scrollable day list, with the zoom chart a tap away

Tapping a day on the calendar should show what happened that day in a form that is easy to read on a phone. This plan replaces the day's seizure list with one scrollable list of doses, rescue meds and seizures in time order, with quiet stretches shrunk and clusters grouped. It then rebuilds the full-screen zoom chart so it opens from a Chart button, moves with a swipe and lands on round times.

> **Date:** 2026-11-05.
> **Status:** Proposed.
> **Goal:** For any calendar day, both of us can read the day's sequence of doses and seizures by scrolling, and use the chart without fighting it. This addresses the five problems from the operator's phone check of the zoom chart (Baseline).
> **Runtime boundary:** Local development; production after the operator's deploy.
> **Safety boundary:** Read-only feature: no schema change and no new writes. Nothing is drawn at a time the data doesn't support, and anything that can't be placed stays listed under "Not on the timeline" as today.

---

## How to read this plan

- **Each task is one agent's assignment**, start to commit. List the headings with `rg -n "^### " Roadmap/day-views.md` and read your task to the next heading, this section, the decisions your task cites, the Non-goals appendix, and the **As built** of your `Depends on:` tasks. Nothing else.
- **Landing a task:** run only the test file you touched (focused command in `AGENTS.md`), plus `npm run lint` and `npm run typecheck`. Flip its `- [ ]` to `- [x]` in the same diff, write **As built**, and commit before the next task. Format and rules: `.agents/skills/roadmap/SKILL.md`.
- **No self-review.** After the commit, stop. Do not run any reviewer on your work; the operator chooses who reviews, and when.
- **Read the Next.js docs first.** This is Next.js 16; read the guide in `node_modules/next/dist/docs/` for any API you use.
- **Phases are ordered by payoff.** The list is the main view and fixes most of the problems on its own, so it ships first. Phase 1 also gives the existing chart a Chart button so it stays reachable. Phase 2 rebuilds that chart. Both phases edit `src/app/calendar/DayTimeline.tsx`, so they run in order.
- **The design is the operator-approved mockup** (DV-D1, DV-D2): https://claude.ai/artifact/3qiBSyEswZB2bvZ7dCAH9U. Its numbers (the 60-minute break, 3 px per minute, the 5-minute bar scale, the snap steps) are written into the tasks; the tasks win where the two differ.
- **Differs from the standard:** like the archived `Roadmap/archive/day-timeline.md`, each phase review block has a second checkbox for the operator's deploy.

---

## 0. Decisions this plan assumes

The dose-time table from the archived plan (DL-D1: morning 6 AM, evening and dinner 6 PM, twice daily both) still holds, unchanged, in `DOSE_LABEL_TIMES` (`src/lib/dayTimeline.ts`).

### DV-D1 — A vertical list is the main view of a day

- **Proposed:** The day card shows the 24-hour strip and, below it, one list of daily-dose groups, rescue doses and seizures in time order. The list replaces the separate seizure list. Quiet stretches of an hour or more shrink to one line; shorter gaps get space in proportion to their length. Seizures starting within an hour of the previous one are grouped under a cluster heading. Tapping the strip scrolls to the nearest row.
- **Evidence:** The operator's phone check, 2026-11-05: the zoom chart's layout, small dots, odd time windows, hard-to-find zoom and arrow navigation all felt clunky. Scrolling up and down is the natural one-handed gesture.
- **Decision and rationale:** Operator, 2026-11-05: answer A (vertical timeline) over fixing the chart or polishing it, then "i think that all looks fantastic" to the mockup.

### DV-D2 — The chart stays, full screen behind a Chart button, and moves with a swipe

- **Proposed:** A Chart button beside the day's date opens the chart full screen. A sideways swipe moves it, with the arrows kept as a backup, and windows snap to round times. Tapping a dot shows its details under the chart, with a link to the seizure. A strip under the chart boxes the visible part of the day; tapping it jumps there.
- **Evidence:** The operator wanted "an improved horizontal graph as well". Full screen is the one place a sideways swipe can't fight page scrolling. This replaces the "no drag-to-pan" part of the archived DL-D2.
- **Decision and rationale:** Operator, 2026-11-05: answer A over a List/Chart switch in the card or only improving the strip, then approved the mockup.

---

## 1. Baseline evidence

- **Day card today** (`src/app/calendar/page.tsx`, `DayList`): `h2#day-heading` with `formatDate(day)`; `<DayTimeline timeline dateLabel>`; the `timeline.notPlaced` lines; medication-change chips; then the seizure list (one link per seizure to `/seizures/[id]`, showing `formatTime`, `durationText(seizure)` and `SEVERITY_LABELS`), or "No seizures on this day."
- **`src/app/calendar/DayTimeline.tsx` today** (DL2.1 plus Codex review fixes F1–F2): the compact 140px chart is a `<button>` ("Open the day's timeline", with a "Zoom" hint) that opens a native `<dialog>`. The dialog has a range header, ◀ ▶ buttons, a 24 h / 6 h / 1 h / 15 min control, a 260px recharts `ScatterChart` (`TimelineChart`), click tooltips (`PointTooltip`), tap-to-zoom (`handleChartClick` using `minuteAtX`), and a list of what's in the window (`windowItems`, using `overlapsWindow`). A `useEffect` cleanup closes the dialog when the calendar is hidden or unmounted, because Next keeps the previous route alive but hidden.
- **`src/lib/timelineZoom.ts`:** `ZOOM_SPANS`, `ZoomWindow`, `overlapsWindow`, `centeredWindow` (rounds to a whole minute), `zoomIn`, `shiftWindow` (half a span, rounded), `windowTicks`, `minuteAtX`. Tests are in `src/lib/timelineZoom.test.ts`.
- **Operator's phone check, 2026-11-05.** Five problems: the layout is mostly empty space and doses and seizures are listed differently; dots are small, the tooltip repeats the list, and there's no way from a dot to its seizure; windows land on times like 2:11 – 3:11 PM; zoom is hard to discover; moving with arrows is clunky.

---

## Phase 1 — The day list

Medium effort: one pure layout function and one list component, plus rewiring the day card. Highest payoff: it is the view used every time a day is opened.

### DV1.1 — Show the day as one scrollable list of doses and seizures

- **Parallel:** nothing. **Depends on:** DV-D1.
- **Reachability:** ui — Calendar tab (`/calendar`): tap a day; the list fills the day card under the 24-hour strip, and a Chart button sits beside the date.
- **Builds:** Tapping a calendar day shows his daily doses, rescue meds and seizures in one list in time order, with quiet stretches shrunk, clusters grouped, and each seizure's length drawn as a bar. Tapping the day strip jumps to that time.
- **What exists.** Baseline items 1–2. `DayTimeline` (`src/lib/dayTimeline.ts`) is `{ seizures: { id, minute, severity, durationSeconds }[]; scheduled: { minute, drugName, amount, doseUnit, when }[]; rescue: { minute, medicationName, doseAmount, doseUnit }[]; notPlaced: string[] }`, each sorted by minute. `durationSeconds` is null when the seizure has no end time or ran over `MAX_SEIZURE_SECONDS`. `clockText(minute, short)` is private to `DayTimeline.tsx` and handles 1440 as midnight. `durationText(seizure)` in `page.tsx` gives "1 min 30 s", "Still going" or "Duration not recorded".
- **Inputs.**
  - The day's `DayTimeline`, already built in `page.tsx`. Empty (no doses, rescue or seizures): the list reads "Nothing logged on this day." Doses but no seizures: the list shows the doses, and the summary line says "No seizures".
  - Seizure with `durationSeconds` null: no bar; its end is its start for gap purposes; the text uses `durationText` as today ("Still going" or "Duration not recorded").
  - Seizure running past midnight: its end is clamped at 1440.
  - Overlapping events (one starts before the previous seizure ends): the gap is 0, never negative.
  - Two seizures in the same minute: the second's "since last" reads "same minute", not "+0 min".
  - Several items at one minute: daily doses first, then rescue, then seizures.
- **What to build.**
  - [x] `src/lib/format.ts`: move `clockText` there as `formatMinuteOfDay(minute: number, short = false): string` (same output, "12:00 AM" for 1440), and have `DayTimeline.tsx` import it.
  - [x] New `src/lib/dayAgenda.ts` (pure): `BREAK_MINUTES = 60`, `CLUSTER_MINUTES = 60`, and `buildDayAgenda(timeline: DayTimeline): AgendaRow[]`, where `AgendaRow` is one of:
    - `{ kind: "doses"; minute; lines: string[] }`: every scheduled dose at that minute, as `"<drugName> <amount> <doseUnit>"`.
    - `{ kind: "rescue"; minute; text }`: `"<medicationName>"` plus `" <doseAmount> <doseUnit>"` when an amount exists.
    - `{ kind: "seizure"; id; minute; severity; durationSeconds; sinceLastMinutes: number | null }`. `sinceLastMinutes` is the gap from the previous seizure's start when that gap is 60 minutes or less; otherwise null.
    - `{ kind: "cluster"; count; startMinute; endMinute }`: placed just before the first seizure of a run of 2 or more seizures whose consecutive starts are at most `CLUSTER_MINUTES` apart. `endMinute` is the latest end in the run, rounded up.
    - `{ kind: "gap"; minutes; collapsed: boolean }`: between two event rows, measured from the earlier row's end to the later row's start. `collapsed` when `minutes >= BREAK_MINUTES`. There is no gap before the first event or after the last.
  - [x] New `src/app/calendar/DayAgenda.tsx` (server component), laid out as in the mockup:
    - Each event row is a grid: a time column (`formatMinuteOfDay`, tabular figures), a rail marker (brand circle, accent diamond or alert circle), then the content. The rows sit on one vertical rail line.
    - A doses row reads "Daily doses", with its lines joined by " · " below.
    - A rescue row reads "Rescue: <text>".
    - A seizure row is a full-width link to `/seizures/[id]`, at least 56px tall: "Seizure, <severity>" (or "Seizure"), " · " plus the duration text, a chevron, and a 6px alert bar with width `min(100, durationSeconds / 300 × 100)%` on a faint track. There is no bar when `durationSeconds` is null.
    - A cluster row is an uppercase alert-coloured heading: "Cluster · 9 seizures · 2:00 PM – 2:50 PM".
    - A collapsed gap reads "<n h m min>, nothing logged", with a dashed rail. An open gap is a spacer `clamp(6, minutes × 3, 90)` px tall; when the next row is a seizure with `sinceLastMinutes`, the spacer is at least 22px and reads "+<n> min" (or "same minute").
    - Props: `{ rows: AgendaRow[]; durationTexts: Record<string, string> }`. Each event row carries `data-agenda-minute={minute}`.
  - [x] `DayTimeline.tsx`, compact part only:
    - It renders the card's header: a row with `h2#day-heading` (`dateLabel`) and a Chart button (`Icon name="chart"`, text "Chart") that opens the existing dialog, which is otherwise unchanged in this task.
    - Below that, a summary line, e.g. "9 seizures · 1 rescue dose" or "No seizures · 0 rescue doses".
    - The strip is no longer a button. Its wrapper is `role="img"` with the day summary as its label. Tapping the plot maps x to a minute with `minuteAtX` and the full-day window, finds the nearest `[data-agenda-minute]` row inside the same card, scrolls it to the centre (`behavior: "auto"` under `prefers-reduced-motion`) and briefly highlights it. A tap outside the plot, or with no rows, does nothing.
    - Below the strip, the hint "Tap the strip to jump to a time." and the legend; the "Zoom" hint goes.
  - [x] `page.tsx` `DayList`: drop its own `h2` and the old seizure list. Render, in order: `DayTimeline`, the `notPlaced` lines, the medication-change chips, and `<DayAgenda rows={buildDayAgenda(timeline)} durationTexts={…} />`. `durationTexts` maps each of the day's seizure ids to `durationText(seizure)`. The section keeps `aria-labelledby="day-heading"`.
- **Tests.** New `src/lib/dayAgenda.test.ts` (pure; build `DayTimeline` objects by hand). Cases:
  - doses at one minute become one row;
  - ties order doses, then rescue, then seizure;
  - a 59-minute gap is open and a 60-minute gap is collapsed;
  - the 9-seizure cluster from 2:00 to 2:48 PM gives one cluster row (count 9, the right `endMinute`) and `sinceLastMinutes` on the other 8;
  - two seizures 61 minutes apart give no cluster and null `sinceLastMinutes`;
  - a seizure with no duration measures its gap from its start;
  - an overlap gives a gap of 0;
  - an empty timeline gives `[]`.

  New `src/lib/format.test.ts` (no format test file exists yet; `clockText` had no tests) with `formatMinuteOfDay` at 0, 360, 1439 and 1440, plus `short`. Run `npx vitest run src/lib/dayAgenda.test.ts src/lib/format.test.ts`.
- **Acceptance:** Both test files pass. Browser check at 390px, light and dark, against the dev database, with the seed rows removed by id afterwards. Seed the four production meds, 9 seizures between 2:00 and 2:50 PM (with end times), Midazolam at 2:46 PM, and one seizure at 4:12 AM. Check each of these:
  - the list matches the mockup's cluster day;
  - tapping the strip near 2:30 PM scrolls to and highlights the nearest row;
  - each seizure row opens its seizure;
  - Chart opens the existing dialog;
  - a seizure-free day shows only its doses;
  - no sideways scroll, no console errors.

- **As built** (Claude Opus 5.5, 2026-11-05):
  - As planned. `sinceLastMinutes` uses `CLUSTER_MINUTES` as its 60-minute limit. Gap `minutes` are not rounded (a seizure can end mid-minute); the collapsed line rounds them for display.
  - The strip tap finds the card with `closest("section")`, and the plot-edge maths moved into a shared `plotMinute(event, view)` used by both the strip and the dialog's tap-to-zoom. The highlight is a `.sw-flash` colour fade in `globals.css`. It is kept under reduced motion because it doesn't move anything; only the scroll becomes instant.
  - The seizure row keeps "· <duration>" on one line so it never wraps mid-value.
  - Checks: the focused tests, lint and typecheck pass. Browser check in headless Chrome at 390px, light and dark, with the 4 production meds, the 9-seizure cluster on Nov 4 (2:00–2:50 PM, Midazolam at 2:46 PM) and a 4:12 AM seizure on Nov 3, seeded into dev and then removed by id. All six acceptance checks passed. The list matches the mockup's cluster day. A strip tap near 2:30 PM scrolled to and flashed the nearest row (2:24 PM; at 390px one pixel of the strip is about 7 minutes). Each seizure row opened its seizure, and Chart opened the existing dialog. A seizure-free day showed only its doses, and an empty day read "Nothing logged on this day." There was no sideways scroll and no console errors.

  - Review fix F1 (2026-11-05): Intervening rescue doses or shorter seizures could erase a continuing seizure's end and show a false quiet stretch; gaps now retain the latest covered end.
  - Review fix F2 (2026-11-05): Since-last labels were hidden from screen readers; only empty gap spacers are now hidden.

### Phase 1 review

- [x] `phase-review` by a reviewer the operator chooses, from a model family that built none of Phase 1 where one is available.
  - 2026-11-05, Codex (GPT-6), B: F1 Major and F2 Minor fixed locally; nothing open; fixes and review uncommitted on main pending operator approval to commit.
- [x] Operator deploys Phase 1 (no migration). Deployed 2026-11-05 with Phase 2, commit ecb766d.

---

## Phase 2 — The chart

Medium effort: pointer handling and window snapping in one component and its pure helpers.

### DV2.1 — Make the full-screen chart swipeable, snap to round times and show dot details

- **Parallel:** nothing. **Depends on:** DV1.1, DV-D2.
- **Reachability:** ui — Calendar tab (`/calendar`): tap a day, then the Chart button beside its date.
- **Builds:** The day's chart opens full screen. You swipe sideways to move through the day, and zooming and moving always land on round times. A tap on a dot shows what happened then, with a link to the seizure. A small day strip shows where you are and jumps when tapped.
- **What exists.** Baseline items 2–3, and DV1.1's **As built** (the Chart button, and `formatMinuteOfDay` in `src/lib/format.ts`). In `DayTimeline.tsx`:
  - the plot-edge constants `CHART_MARGIN`, `Y_AXIS_WIDTH`, `X_AXIS_HEIGHT` and `X_PADDING`;
  - `TimelineChart` (filters points by window, cuts bands with explicit domains, and uses `allowDataOverflow` only when the window has no points);
  - `PointTooltip`, `handleChartClick`, `windowItems` and a `key={`${view.start}-${view.span}`}` remount on the chart wrapper.
- **Inputs.**
  - Pointer gestures on the chart. A horizontal move of at least 8px is a drag, and never also a tap. A drag at 24 h does nothing. `pointercancel` snaps the window where it is. Any second pointer while dragging is ignored.
  - A tap with no drag: on a dot (or within its hit target), select it; on empty plot, `zoomIn` there; in the axis margins, nothing.
  - A tap on the overview strip: centre there, at the current span, or at 1 h when the current span is 24 h.
  - A selected point that leaves the window stays shown in the panel until another is tapped or the dialog closes.
- **What to build.**
  - [x] `src/lib/timelineZoom.ts`:
    - `SNAP_MINUTES: Record<ZoomSpan, number> = { 1440: 1440, 360: 60, 60: 15, 15: 5 }`.
    - `centeredWindow` and `shiftWindow` now round `start` to the nearest snap step, then clamp to `[0, 1440 − span]`.
    - New `dragWindow(window, deltaMinutes): ZoomWindow` moves without snapping (clamped), and new `snapWindow(window): ZoomWindow` snaps and clamps.
    - Update the existing "rounds the start to a whole minute" and "moves by half a span" tests to the snapped values.
  - [x] `DayTimeline.tsx` chart:
    - Remove recharts `Tooltip`, `PointTooltip` and the `key` remount.
    - Pointer handlers on the chart wrapper (`touch-action: pan-y`) implement the Inputs gestures. While dragging, show `dragWindow(start0, −dx / plotWidth × span)`; on release, `snapWindow`.
    - Dots get radius 11 (8 at 24 h) and an invisible 22px-radius hit target, carrying `data-point` with the point's index.
    - A selected dot gets a ring.
  - [x] Under the chart, a details panel: the time (`formatMinuteOfDay`), every line at that minute on that row (the grouping `PointTooltip` used), and, for seizures, one "Open this seizure ›" link per seizure id. With nothing selected it reads "Tap a dot to see what happened then." This replaces `windowItems` and its list, because DV1.1's list is the day's text equivalent.
  - [x] An overview strip under the chart, about 40px tall: the whole day, a small mark per point, and the visible window boxed in the brand colour. Tapping it moves the window per Inputs.
  - [x] Ticks: drop " AM"/" PM" for spans of 60 minutes or less (the range above shows it). Chart height about 230px. Under the strip, the hint "Swipe to move · tap empty space to zoom in · tap a dot for details".
- **Tests.** Extend `src/lib/timelineZoom.test.ts`:
  - `centeredWindow` snaps for each span (e.g. centre 2:40 PM at 1 h gives 2:15 – 3:15 PM, and at 6 h gives 12 – 6 PM, start 720);
  - `shiftWindow` lands on steps and stops at both edges;
  - `dragWindow` clamps without snapping;
  - `snapWindow` rounds and clamps.

  Run `npx vitest run src/lib/timelineZoom.test.ts`.
- **Acceptance:** The test file passes. Browser check at 390px, light and dark, with the DV1.1 seed (removed by id afterwards). Check each of these:
  - every window shown after zooming, swiping or the arrows starts on a snap step;
  - a swipe moves the chart, and the page doesn't scroll sideways;
  - tapping a seizure dot shows its details, and the link opens it;
  - tapping empty plot zooms in there;
  - tapping the overview strip jumps;
  - Close and Escape still return to the calendar;
  - following a seizure link leaves no open dialog behind;
  - no console errors.

- **As built** (Claude Opus 5.5, 2026-11-05):
  - As planned. The snap step comes from the nearest listed span at or below the window's span, which is the same rule `windowTicks` uses, now shared as `listedSpan`. `shiftWindow` still moves by `Math.round(span / 2)` before it snaps, so at 15 min the arrows move 10 minutes each way. Snapping also changed two `zoomIn` test values (620 → 600, 693 → 695).
  - Gestures: the pointer that starts the gesture is captured. The dot under a tap is read at `pointerdown`, and a tap zooms in where it started. `lostpointercapture` is handled like `pointercancel`. While a swipe is under way, the range above the chart and the chart's label show its times rounded to the minute.
  - Each `TimelinePoint` now carries its `index` (the value of `data-point`) and, for a seizure, its `seizureId`. Seizure lines include the duration, as `windowItems` did. The details panel keeps each seizure's line and its "Open this seizure ›" link together, and it is `aria-live`. The 140px day strip keeps its 7px dots and has no tap targets.
  - The overview strip is HTML, positioned by percentages and labelled 12 AM, 12 PM, 12 AM. The legend stays under the hint. `overlapsWindow` has no caller now, but it is still exported and tested.
  - Checks: the focused test, lint and typecheck pass. Browser check in headless Chrome at 390px, light and dark, with the DV1.1 seed in dev (removed by id afterwards). All eight acceptance checks passed. Every window after zooming, swiping, the arrows, the zoom buttons and the overview strip started on a snap step (for example 12–6 PM, then 2:15–3:15 PM, then a swipe to 2:30–3:30 PM). A CDP touch swipe moved the window and snapped it on release, a swipe at 24 h did nothing, and the page never scrolled sideways. A tap inside a seizure dot's target selected it without zooming, and its link opened the seizure with no dialog left open. Taps on empty plot zoomed in, Close and Escape closed the chart, and there were no console errors.

  - Review fix F1 (2026-11-05): Overlapping invisible dot targets selected a later seizure even when tapping an earlier dot's centre; selection now chooses the nearest rendered dot within 22px.

### Phase 2 review

- [x] `phase-review` by a reviewer the operator chooses, from a model family that built none of Phase 2 where one is available.
  - 2026-11-05, Codex (GPT-6), B: F1 Major fixed locally; nothing open; fix and review uncommitted on main pending operator approval to commit.
- [x] Operator deploys Phase 2 (no migration). Deployed 2026-11-05, commit ecb766d.

---

## Appendix: Non-goals

- Any schema change or new write. The list and chart show the schedule and logged events, not proof a dose was given.
- Pinch-to-zoom, a range slider, or keeping the zoom or scroll position in the URL.
- A List/Chart switch inside the day card, or putting the chart anywhere but full screen (DV-D2).
- Showing the previous or next day's events, or a seizure that crosses midnight on both days.
- Changing the calendar grid, the month stats, the seizure detail page or the DL-D1 dose-time table.
- Month- or year-wide time-of-day patterns.
