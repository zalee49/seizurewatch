# SeizureWatch — project rules

## What this is

A web app two people (the owner and their partner) use to track their dog's seizures:
when each seizure happened, medication given, symptoms and other relevant notes.

## Product priorities

- **Easy to use, often on a phone, sometimes mid-seizure.** Logging an event must be fast
  and work one-handed; don't put required fields between the user and saving.
- **Visually easy to interpret.** History should show trends (frequency, timing,
  medication changes) at a glance, not just a raw list.
- **No login.** Both people see and edit the same shared data. Don't add accounts or auth
  unless asked.
- **Keep it simple.** This is a personal tool for one household; avoid infrastructure
  meant for scale.

## Stack

- **Next.js 16 (App Router) + TypeScript + Tailwind CSS 4**, code under `src/`, npm.
- **Hosting:** online, so both phones reach the same data (decided 2026-11-04). Target is
  Vercel with a hosted Postgres; the database and any shared-passcode gate aren't wired
  up yet.
- **Commands:** `npm run dev` (local server at http://localhost:3000), `npm run build`,
  `npm run lint`. No test runner yet.

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
