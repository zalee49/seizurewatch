# SeizureWatch — project rules

## What this is

A web app two people (the owner and their partner) use to track their dog's seizures:
when each seizure happened, medication given, symptoms and other relevant notes.

## Product priorities

- **Easy to use, often on a phone, sometimes mid-seizure.** Logging an event must be fast
  and work one-handed; don't put required fields between the user and saving.
- **Visually easy to interpret.** History should show trends (frequency, timing,
  medication changes) at a glance, not just a raw list.
- **No login or access gate.** Both people see and edit the same shared data. No
  accounts, passcode or secret link (decided 2026-11-04); don't add any unless asked.
- **Keep it simple.** This is a personal tool for one household; avoid infrastructure
  meant for scale.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4**, code under `src/`, npm.
- **Hosting:** online, so both phones reach the same data (decided 2026-11-04). Production
  is https://seizurewatch.vercel.app on Vercel, deployed on every push to `main` of
  `zalee49/seizurewatch` (public repo), with Neon Postgres. `.env.local` points at the
  Neon `dev` branch. Never run `vercel env pull`: the project's Development variables are
  the production database, so it would point local work at live data.
- **Product plan:** `Roadmap/GlobalRoadmap.md` holds the sections of the app and the
  product decisions made so far.
- **Commands:** `npm run dev` (local server at http://localhost:3000), `npm run build`,
  `npm run lint`, `npm run typecheck`, `npx vitest run <file>` (focused test; `npm run test`
  runs all), `npm run db:generate` (new migration from `src/lib/db/schema.ts`, offline).
  `npm run db:migrate` connects to `DATABASE_URL` (the dev database from `.env.local`);
  run it against production only with the operator's yes.

## Planning and decisions

- Decisions put to the operator use the `inquisition` skill format.
- Multi-step plans live in `Roadmap/` and follow the `roadmap` skill.
- Skills live in `.agents/skills/<name>/SKILL.md`; `.claude/skills/<name>` is a symlink
  to each.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
