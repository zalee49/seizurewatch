# SeizureWatch

A web app for tracking our dog's seizures. Two of us log each seizure along with the
medication given, symptoms and any other notes, and the app shows the history in a way
that's easy to read at a glance so patterns are easier to spot.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
npm run typecheck
npm run test           # all tests; one file: npx vitest run <file>
npm run db:generate    # create a migration from src/lib/db/schema.ts (offline)
npm run db:migrate     # apply migrations to DATABASE_URL (.env.local, see .env.example)
```
