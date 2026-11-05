# Dayline: Show a day's seizures against his medication times

Tapping a day on the calendar today shows a plain list of that day's seizures. This plan adds a 24-hour timeline at the top of that day view, with his daily medication doses, the rescue meds given and the seizures placed at their times of day. You can then see at a glance whether seizures fall before or after a dose.

> **Date:** 2026-11-05.
> **Status:** In progress (Phase 1 deployed, phone acceptance pending; Phase 2 deployed, phone acceptance pending).
> **Goal:** For any day on the calendar, one picture shows when each seizure started relative to his 6 AM and 6 PM doses and any rescue meds given that day.
> **Runtime boundary:** Local development; production after the operator's deploy.
> **Safety boundary:** Read-only feature: no schema change, no new writes. Nothing is drawn at a time the data doesn't support; a dose whose time can't be worked out is listed, not guessed.

---

## How to read this plan

- **Each task is one agent's assignment**, start to commit. List the headings with `rg -n "^### " Roadmap/archive/day-timeline.md` and read your task to the next heading, this section, the decisions your task cites, and the Non-goals appendix. Nothing else.
- **Landing a task:** run only the test file you touched (focused command in `AGENTS.md`), plus `npm run lint` and `npm run typecheck`. Flip its `- [ ]` to `- [x]` in the same diff, write **As built**, and commit before the next task. Format and rules: `.agents/skills/roadmap/SKILL.md`.
- **No self-review.** After the commit, stop. Do not run any reviewer on your work; the operator chooses who reviews, and when.
- **Read the Next.js docs first.** This is Next.js 16; read the guide in `node_modules/next/dist/docs/` for any API you use.
- **One task per phase.** The time-placement logic and the chart that draws it share one interface, so one agent builds both (sizing rule: coupled work is one task). Phase 2 extends the same chart.
- **Where numbers come from:** dose labels in production read 2026-11-05 (Baseline); the 6 AM and 6 PM times are the operator's (DL-D1).
- **Differs from the standard:** like `Roadmap/archive/v1.md`, the phase review block has a second checkbox for the operator's deploy.

---

## 0. Decisions this plan assumes

### DL-D1 — Daily doses are placed by their label at the household's fixed dose times

- **Proposed:** No new "clock time" field. A maintenance dose's free-text `when` is matched, trimmed and case-insensitive, against a fixed table: `morning` → 6:00 AM; `evening` and `dinner` → 6:00 PM; `twice daily` → 6:00 AM and 6:00 PM. Any other label is not drawn; it is listed under the chart as "Not on the timeline: <drug> <amount> <label>". Rescue ("cluster buster") meds are drawn at the exact `givenAt` time logged on the seizure's response.
- **Evidence:** The operator, 2026-11-05: "morning meds are at 6am and evening meds are at 6pm. cluster buster drugs will be a specific time." Production labels (Baseline) are only "Twice daily", "Morning" and "Dinner". Dinner is read as the 6 PM evening dose; the operator can correct that by editing the table.
- **Decision and rationale:** Operator, 2026-11-05, chosen over adding a clock-time field per dose (no schema change, nothing new to enter). If a label outside the table appears, extend the table in code rather than guessing.

### DL-D2 — Zoom with buttons and tap, not pinch or a slider

- **Proposed:** The expanded timeline zooms with fixed spans (24 h, 6 h, 1 h, 15 min), ◀ ▶ to move, and a tap on empty space to zoom in there.
- **Evidence:** It's often used one-handed on a phone, sometimes just after a seizure. Pinch-and-drag needs two hands and can fight page scrolling, and a range slider's handles are small on a phone.
- **Decision and rationale:** Operator, 2026-11-05, answer A over pinch-and-drag and a range slider.

---

## 1. Baseline evidence

- **Calendar day view** (`src/app/calendar/page.tsx`): tapping a day links to `/calendar?month=YYYY-MM&day=YYYY-MM-DD`, which renders `DayList` below the grid. `DayList` shows the date, that day's medication-change chips and one row per seizure (time, duration, severity), linking to `/seizures/[id]`. No graph.
- **Production medication periods, 2026-11-05** (all maintenance, all ongoing):

  | Drug | Doses (`amount` / `when`) |
  | :-- | :-- |
  | Keppra XR | 1000 / Twice daily |
  | Phenobarbital | 75 / Twice daily |
  | Potassium Bromide | 500 / Morning; 625 / Dinner |
  | Zonisamide | 400 / Twice daily |

- **Rescue meds:** no seizure responses are logged in production yet. Rule 10 trace: a timed rescue dose is produced by `addResponse` (`src/lib/data/seizures.ts`) from the response form in `src/app/seizures/[id]/Responses.tsx`. Its `givenAt` field is optional, so an untimed rescue dose is possible.

---

## Phase 1 — Day timeline

Small effort: one chart and one pure function on data the calendar already loads, plus one medication lookup.

### DL1.1 — Draw a 24-hour timeline for the selected calendar day

- **Parallel:** nothing. **Depends on:** DL-D1.
- **Reachability:** ui — Calendar tab (`/calendar`): tap a day; the timeline sits at the top of the day card, above the seizure list.
- **Builds:** Tapping a day on the calendar shows a 24-hour timeline: his scheduled doses, any rescue meds given and each seizure, at their times of day.
- **What exists.**
  - `src/app/calendar/page.tsx`: `CalendarContent` loads `listSeizuresBetween(getDb(), from, to)` for the month (each `Seizure` carries `responses: SeizureResponse[]`) and `listMedicationChanges`. `DayList({ day, seizures, medChanges })` filters with `dayKey(s.startedAt) === day`. The page has no client components yet.
  - `src/lib/data/medications.ts`: `listCurrentMedications(db, onDate: "YYYY-MM-DD"): Promise<MedicationPeriod[]>` returns periods with `startDate <= onDate < endDate` (or no end). `MedicationPeriod` has `drugName`, `role` (`"maintenance" | "rescue"`), `doses: DoseLine[]` (`{ amount: number; when: string }`) and `doseUnit`.
  - `src/lib/data/seizures.ts`: `SeizureResponse = { id, kind: "rescue_med" | "other", medicationName, doseAmount, doseUnit, givenAt: Date | null, description }`; `Seizure` has `startedAt`, `endedAt: Date | null`, `severity`, `seizureType`.
  - `src/lib/time.ts`: `HOUSEHOLD_TIME_ZONE = "America/New_York"`, `dayKey(Date)`. Nothing yet gives the household clock time of an instant. `src/lib/format.ts`: `formatTime`, `formatDate`.
  - Charting: `recharts` is installed. `src/app/bloodwork/trends/TrendChart.tsx` is the house pattern: a `"use client"` component, colours from CSS variables (`var(--sw-alert)`, `var(--sw-brand)`), ticks formatted in household time.
- **Inputs.**
  - `?day=` — as today (`parseDay`). Malformed or outside the shown month: no day card, so no timeline.
  - Maintenance periods in force on the day, from `listCurrentMedications(db, day)`. A label not in the DL-D1 table is listed under "Not on the timeline", never drawn. Rescue-role periods are not drawn as scheduled doses; they are given as needed. A period that starts or ends on this day counts for the whole day (periods are day-granular).
  - Rescue responses on the day's seizures. `givenAt` null: listed as "Time not recorded: <med> <dose>". `givenAt` on a different household day from the seizure: not drawn; listed as "Given <date>, <time>". `kind: "other"` responses are not drawn.
  - Seizures on the day (`dayKey(startedAt) === day`, the existing grouping). Placed at the household clock time of `startedAt`. A seizure that runs past midnight is drawn only on its start day. On the DST fall-back day, 1:00–2:00 AM happens twice and both are placed by clock time.
  - Medication lookup fails: the whole page errors as other database reads do today; no partial chart.
- **What to build.**
  - [x] `src/lib/time.ts`: `minuteOfDay(date: Date): number`, the household clock time as minutes after midnight (0–1439).
  - [x] New `src/lib/dayTimeline.ts`: `DOSE_LABEL_TIMES: Record<string, number[]>` (minutes, keys lower-case: `morning: [360]`, `evening: [1080]`, `dinner: [1080]`, `"twice daily": [360, 1080]`) and
    `buildDayTimeline(day: string, seizures: Seizure[], periods: MedicationPeriod[]): DayTimeline`, where
    `DayTimeline = { seizures: { id: string; minute: number; severity: Severity | null }[]; scheduled: { minute: number; drugName: string; amount: number; doseUnit: string; when: string }[]; rescue: { minute: number; medicationName: string; doseAmount: number | null; doseUnit: string | null }[]; notPlaced: string[] }`. `notPlaced` holds the ready-to-show lines from the Inputs block. It filters seizures to the day itself and periods to `role === "maintenance"`.
  - [x] New `src/app/calendar/DayTimeline.tsx` (`"use client"`, recharts `ScatterChart`, following `TrendChart.tsx`): x axis 0–1440 minutes with ticks at 12 AM, 6 AM, 12 PM, 6 PM, 12 AM. Two rows: "Meds" (scheduled doses in the brand colour, rescue doses in a second colour with a distinct shape) and "Seizures" (alert colour). A light vertical guide at 6 AM and 6 PM. Tapping a point shows a tooltip, for example "6:00 AM · Keppra XR 1000 mg (twice daily)" or "2:14 PM · seizure, moderate". A one-line legend. Height about 140px; no sideways scroll at 390px wide.
  - [x] `src/app/calendar/page.tsx`: when a valid `?day=` is shown, load `listCurrentMedications(getDb(), day)`, call `buildDayTimeline`, and render `DayTimeline` at the top of the `DayList` card with the `notPlaced` lines under it. A day with no seizures still shows the dose schedule, so seizure-free days can be compared. The existing seizure list stays as the text equivalent.
- **Tests.** Extend `src/lib/time.test.ts` with `minuteOfDay` across a DST change (the risk is an hour shift). New `src/lib/dayTimeline.test.ts` (pure, no DB), one case per Inputs outcome:
  - "Twice daily" gives 360 and 1080.
  - "Dinner" gives 1080.
  - An unknown label goes to `notPlaced`.
  - A rescue-role period is ignored.
  - A rescue response with no `givenAt` goes to `notPlaced`.
  - A rescue response given the next day goes to `notPlaced` with its date.
  - An `other` response is ignored.
  - A 10:30 PM EST seizure lands at minute 1350 on its household day.
  - A seizure from another day is excluded.

  Run `npx vitest run src/lib/time.test.ts src/lib/dayTimeline.test.ts`.
- **Acceptance:** Both test files pass. A browser check at 390px, light and dark, against the dev database, with the seed rows removed afterwards by id: a day with two seizures and a timed rescue dose shows the dots at the right times next to the 6 AM and 6 PM doses, and Potassium Bromide appears at 6 AM and 6 PM. The operator then sees a real day's timeline on a phone after deploy.
- **As built.** Claude Sonnet (Wolverine) built it and Claude Opus 5.5 verified and fixed it, 2026-11-05.
  - Doses at the same minute share one dot, and its tooltip lists each drug on its own line, so the 6 AM dot names all four meds.
  - Rescue doses are accent-colour diamonds; daily doses and seizures are circles.
  - Unplaced lines read "Not on the timeline: <drug> <amount> <unit> <label>", "Time not recorded: <med> <dose>" and "Given <date>, <time>: <med> <dose>".
  - A rescue response with no name shows as "Rescue medication".
  - Browser-check fixes: the tooltip wraps at 15rem and sits above the legend, and tapping no longer draws a focus box around the chart.
  - Checks: the focused tests, lint, typecheck and build pass. Browser check in headless Chrome at 390px, light and dark, with the 4 production meds plus a "Bedtime" dose, seizures at 4:12 AM and 2:40 PM, and Midazolam at 2:46 PM on Nov 3, seeded into dev and then removed by id. Every dot was in the right place, each dot type's tooltip opened on tap, there was no sideways scroll and no console errors, and a seizure-free day still showed the doses. Phone acceptance waits for the deploy.
  - Review fix F1 (2026-11-05): a rescue dose logged at the same minute as a daily dose — or a second rescue at the same minute — hid the other lines in the tooltip; tapping a shared spot now lists every dose at that minute.
  - Review fix F2 (2026-11-05): the chart's spoken summary said "1 rescue doses"; it now pluralises ("1 rescue dose", "0 rescue doses").
  - Review fix F3 (2026-11-05): a maintenance drug whose stored dose lines were all unreadable vanished from the timeline with nothing said; it is now listed as "Not on the timeline: <drug> (dose not recorded)".

### Phase 1 review

- [x] `phase-review` by a reviewer the operator chooses, from a model family that built none of Phase 1 where one is available.
  - 2026-11-05, DeepSeek (deepseek-flash): B+, F1–F3 fixed, F4 left to the operator (an unrelated home-page quick-link removal sits in the same working tree); DL1.1 and the fixes are uncommitted on `main`.
- [x] Operator deploys Phase 1 (no migration).
  - Deployed 2026-11-05 by pushing `main` (caedf75), on the operator's yes; Vercel built it from the push, and the live calendar draws the timeline. Phone acceptance is still pending.

---

## Phase 2 — Zoom into the day

Small to medium effort, from real use (2026-11-05): a day with 9 seizures piles them into one spot on the 24-hour strip. Operator chose zoom buttons plus tap-to-zoom (DL-D2).

### DL2.1 — Open the day's timeline full screen and zoom into it

- **Parallel:** nothing. **Depends on:** DL1.1, DL-D2.
- **Reachability:** ui — Calendar tab (`/calendar`): tap a day, then tap its timeline (or its "Zoom" button) to open the full-screen view.
- **Builds:** Tapping a day's timeline opens it full screen. You can zoom from the whole day down to 15 minutes, move earlier or later, and read every dose and seizure in the stretch you're looking at.
- **What exists.**
  - `src/app/calendar/DayTimeline.tsx` (`"use client"`, from DL1.1 and its review fixes): `DayTimeline({ timeline })` draws a 140px recharts `ScatterChart` with x from 0 to 1440 (`domain={[0, 1440]}`, fixed `TICKS`/`TICK_TEXT`, `padding={{ left: 12, right: 12 }}`), y rows `MEDS_ROW = 2` and `SEIZURES_ROW = 1` (`YAxis width={68}`), chart margin `{ top: 8, right: 8, bottom: 0, left: 0 }`, `ReferenceLine`s at 360 and 1080, and three `Scatter`s (daily doses grouped per minute by `scheduledPoints`, rescue diamonds, seizures) drawn by `Marker`. `PointTooltip` (`trigger="click"`) lists every point at the tapped minute and row. `clockText(minute)`, `doseText`, `plural` and a one-line legend sit below.
  - `src/lib/dayTimeline.ts`: `DayTimeline.seizures` is `{ id, minute, severity }[]`, and `buildDayTimeline(day, seizures, periods)` fills it from `Seizure.startedAt` via `minuteOfDay` (`src/lib/time.ts`). `Seizure.endedAt` is `Date | null` (`src/lib/data/seizures.ts`). Tests are in `src/lib/dayTimeline.test.ts`.
  - `src/app/calendar/page.tsx` renders `<DayTimeline timeline={timeline} />` inside `DayList`, under the `#day-heading` date (`formatDate(day)`).
  - `MAX_SEIZURE_SECONDS` (2 hours) in `src/lib/validation/seizure.ts`; `formatDuration` in `src/lib/format.ts`.
- **Inputs.**
  - The `DayTimeline` data already built for the day. A seizure with no `endedAt`, or one longer than `MAX_SEIZURE_SECONDS`: no duration band and no duration in its text. A seizure ending after midnight: its band stops at 1440.
  - Taps on the chart. A tap on a point opens its tooltip as today. A tap on empty plot area zooms one level in, centred on that minute. A tap in the axis margins outside the plot does nothing.
  - The zoom window is always clamped inside 0–1440, so a window never shows time outside the day.
- **What to build.**
  - [x] `src/lib/dayTimeline.ts`: `DayTimeline.seizures` items gain `durationSeconds: number | null` (whole seconds from `startedAt` to `endedAt`; null per Inputs). Extend `src/lib/dayTimeline.test.ts` with an ended, an unended and an over-limit seizure.
  - [x] New `src/lib/timelineZoom.ts` (pure):
    - `ZOOM_SPANS = [1440, 360, 60, 15] as const` and `ZoomWindow = { start: number; span: number }`.
    - `centeredWindow(center, span): ZoomWindow` clamps `start` to `[0, 1440 - span]`.
    - `zoomIn(window, center)` moves to the next smaller span, centred; at 15 minutes it stays at 15, recentred.
    - `shiftWindow(window, direction: -1 | 1)` moves by half the span, clamped.
    - `windowTicks(window): number[]` steps by 360, 60, 15 or 5 minutes for spans of 1440, 360, 60 or 15, and includes both ends when they fall on a step.
    - `minuteAtX(x, plotLeft, plotWidth, window): number | null` returns null outside the plot.
  - [x] `DayTimeline.tsx`: the compact chart becomes a `<button>` (`aria-label` "Open the day's timeline", with a small "Zoom" hint in the legend line) with no tooltips. Tapping it opens a native `<dialog>` via `showModal()`, styled full screen, with:
    - a header with the date (passed in as a new `dateLabel` prop from `page.tsx`, `formatDate(day)`) and the visible range, e.g. "2:00 PM – 3:00 PM";
    - a Close button (Escape also closes, as `<dialog>` does);
    - a segmented control "24 h · 6 h · 1 h · 15 min", which keeps the current centre;
    - ◀ ▶ buttons, disabled at the day's edges;
    - the chart, about 260px tall, using the window as its x domain (`allowDataOverflow`, points outside it filtered out), with ticks from `windowTicks` labelled by `clockText` ("6 AM" style, dropping ":00" for spans of 6 h or more), the 6 AM and 6 PM guides only when in view, and point tooltips as today;
    - each seizure with a `durationSeconds` drawn as a band from its start to its end on the Seizures row (a recharts `ReferenceArea`), so at 15 min a 3-minute seizure shows its length.
  - [x] In the dialog, below the chart: a list of everything in the window by time, e.g. "2:40 PM · Seizure, severe · 3 min 30 s" (each seizure line links to `/seizures/[id]`), "2:46 PM · Rescue: Midazolam 5 mg", "6:00 PM · Keppra XR 1000 mg (twice daily)". It reads "Nothing in this stretch" when empty.
  - [x] Tap-to-zoom: a click on the dialog chart's empty plot area calls `zoomIn` at `minuteAtX`. The plot edges come from the same constants as the chart props (y-axis width, margins, x padding), defined once in `DayTimeline.tsx`, with the width measured from the chart container.
- **Tests.** New `src/lib/timelineZoom.test.ts`:
  - centring near 0 and near 1440 clamps;
  - `zoomIn` from 1440 gives 360 around the tap, and from 15 stays at 15;
  - `shiftWindow` stops at both edges;
  - `windowTicks` for each span;
  - `minuteAtX` maps the left edge, the middle and the right edge, and gives null outside.

  Plus the `durationSeconds` cases above. Run `npx vitest run src/lib/timelineZoom.test.ts src/lib/dayTimeline.test.ts`.
- **Acceptance:** Both test files pass. Browser check at 390px, light and dark, seeding the dev database with a 9-seizure cluster between 2:00 and 2:50 PM plus the four production meds, then removing the rows by id. Check each of these:
  - the compact chart opens the dialog;
  - 15 min around 2:40 PM shows separate seizures with duration bands;
  - ◀ ▶ stop at midnight;
  - tapping empty plot zooms in where tapped;
  - the window list matches the dots;
  - Close and Escape return to the calendar;
  - no sideways scroll, no console errors.
- **As built.** Claude Opus 5.5 built the dialog and Claude Sonnet (Wolverine) built `timelineZoom.ts`, `durationSeconds` and their tests, 2026-11-05.
  - Window starts are whole minutes: `centeredWindow` rounds, and `shiftWindow` moves by half a span rounded (15 min moves 8). `zoomIn` past 15 stays at 15.
  - The chart doesn't use `allowDataOverflow`, because its clip cut a dot on the window's edge in half; points are filtered to the window, and bands are cut to it, by hand. Ticks thin evenly (`equidistantPreserveStart`) when labels would collide. The 24 h range reads "Whole day". Each open starts at 24 h.
  - The dialog closes itself when the calendar is hidden or unmounted. Without this, a seizure link left an invisible open modal behind on the next page, because Next keeps the previous route alive but hidden.
  - Checks: the focused tests, lint, typecheck and build pass. Browser check in headless Chrome at 390px, light and dark, against the dev database with the four production meds, 9 seizures from 2:00 to 2:48 PM on Nov 4 and Midazolam at 2:46 PM, all removed by id afterwards. Every listed acceptance item held, plus links leaving the dialog cleanly.
  - Review fix F1 (2026-11-05): a window with no event starts lost its axes and any continuing seizure band; explicit domains now keep both visible without clipping edge dots in populated windows.
  - Review fix F2 (2026-11-05): the window list omitted seizures that started earlier but continued into view, sometimes saying "Nothing in this stretch"; overlapping seizures now retain their start time, duration and detail link.

### Phase 2 review

- [x] `phase-review` by a reviewer the operator chooses, from a model family that built none of Phase 2 where one is available.
  - 2026-11-05, GPT-6 Codex: B, F1–F2 fixed locally, nothing open; Phase 2 and review fixes committed in 7a8bfc8.
- [x] Operator deploys Phase 2 (no migration).
  - Deployed 2026-11-05 by pushing `main` (7a8bfc8), on the operator's yes; Vercel built it from the push, and the live calendar serves the zoomable timeline. Phone acceptance is still pending.

---

## Appendix: Non-goals

- A clock-time field on doses, or any schema change (DL-D1).
- Logging each daily dose as actually given; the timeline shows the schedule, not proof a dose was taken.
- A month- or year-wide time-of-day pattern (every seizure plotted by hour across many days). This is a likely follow-up once a few weeks of data exist; it is not part of this plan.
- Showing the previous or next day's doses on the timeline, or seizures that cross midnight on both days.
- Changing the calendar grid, the month stats or the seizure detail page.
- Pinch-to-zoom, drag-to-pan or a range slider (DL-D2), and keeping the zoom in the URL.
