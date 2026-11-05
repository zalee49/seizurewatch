# Dayline: Show a day's seizures against his medication times

Tapping a day on the calendar today shows a plain list of that day's seizures. This plan adds a 24-hour timeline at the top of that day view, with his daily medication doses, the rescue meds given and the seizures placed at their times of day. You can then see at a glance whether seizures fall before or after a dose.

> **Date:** 2026-11-05.
> **Status:** In progress (DL1.1 built and reviewed; deploy open).
> **Goal:** For any day on the calendar, one picture shows when each seizure started relative to his 6 AM and 6 PM doses and any rescue meds given that day.
> **Runtime boundary:** Local development; production after the operator's deploy.
> **Safety boundary:** Read-only feature: no schema change, no new writes. Nothing is drawn at a time the data doesn't support; a dose whose time can't be worked out is listed, not guessed.

---

## How to read this plan

- **Each task is one agent's assignment**, start to commit. List the headings with `rg -n "^### " Roadmap/day-timeline.md` and read your task to the next heading, this section, the decisions your task cites, and the Non-goals appendix. Nothing else.
- **Landing a task:** run only the test file you touched (focused command in `AGENTS.md`), plus `npm run lint` and `npm run typecheck`. Flip its `- [ ]` to `- [x]` in the same diff, write **As built**, and commit before the next task. Format and rules: `.agents/skills/roadmap/SKILL.md`.
- **No self-review.** After the commit, stop. Do not run any reviewer on your work; the operator chooses who reviews, and when.
- **Read the Next.js docs first.** This is Next.js 16; read the guide in `node_modules/next/dist/docs/` for any API you use.
- **One phase, one task.** The time-placement logic and the chart that draws it share one interface, so one agent builds both (sizing rule: coupled work is one task).
- **Where numbers come from:** dose labels in production read 2026-11-05 (Baseline); the 6 AM and 6 PM times are the operator's (DL-D1).
- **Differs from the standard:** like `Roadmap/v1.md`, the phase review block has a second checkbox for the operator's deploy.

---

## 0. Decisions this plan assumes

### DL-D1 — Daily doses are placed by their label at the household's fixed dose times

- **Proposed:** No new "clock time" field. A maintenance dose's free-text `when` is matched, trimmed and case-insensitive, against a fixed table: `morning` → 6:00 AM; `evening` and `dinner` → 6:00 PM; `twice daily` → 6:00 AM and 6:00 PM. Any other label is not drawn; it is listed under the chart as "Not on the timeline: <drug> <amount> <label>". Rescue ("cluster buster") meds are drawn at the exact `givenAt` time logged on the seizure's response.
- **Evidence:** The operator, 2026-11-05: "morning meds are at 6am and evening meds are at 6pm. cluster buster drugs will be a specific time." Production labels (Baseline) are only "Twice daily", "Morning" and "Dinner". Dinner is read as the 6 PM evening dose; the operator can correct that by editing the table.
- **Decision and rationale:** Operator, 2026-11-05, chosen over adding a clock-time field per dose (no schema change, nothing new to enter). If a label outside the table appears, extend the table in code rather than guessing.

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

## Appendix: Non-goals

- A clock-time field on doses, or any schema change (DL-D1).
- Logging each daily dose as actually given; the timeline shows the schedule, not proof a dose was taken.
- A month- or year-wide time-of-day pattern (every seizure plotted by hour across many days). This is a likely follow-up once a few weeks of data exist; it is not part of this plan.
- Showing the previous or next day's doses on the timeline, or seizures that cross midnight on both days.
- Changing the calendar grid, the month stats or the seizure detail page.
