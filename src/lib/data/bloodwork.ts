import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { bloodDraws, bloodResults } from "@/lib/db/schema";
import {
  bloodDrawSchema,
  bloodworkErrorMessage,
  bloodworkFieldErrors,
  trendKey,
  type BloodDrawInput,
  type ParsedDraw,
} from "@/lib/validation/bloodwork";
import { idSchema } from "@/lib/validation/seizure";
import { CONFLICT_MESSAGE, type SaveResult } from "./result";

export type BloodResult = {
  id: string;
  testName: string;
  value: number;
  unit: string;
  rangeLow: number | null;
  rangeHigh: number | null;
};

export type BloodDraw = {
  id: string;
  drawnAt: Date;
  lab: string | null;
  notes: string | null;
  updatedAt: Date;
  results: BloodResult[];
};

export type TrendSeries = {
  // trendKey(testName, unit): name and unit ignoring case and surrounding spaces.
  key: string;
  testName: string;
  unit: string;
  points: { drawId: string; drawnAt: Date; value: number; rangeLow: number | null; rangeHigh: number | null }[];
};

const NOTHING_SAVED = "Nothing was saved.";

type DrawRow = typeof bloodDraws.$inferSelect;
type ResultRow = typeof bloodResults.$inferSelect;

function refuse(
  error: "invalid" | "not_found" | "conflict",
  message: string,
  fieldErrors?: Record<string, string>,
): SaveResult<never> {
  return fieldErrors
    ? { ok: false, error, message: `${message} ${NOTHING_SAVED}`, fieldErrors }
    : { ok: false, error, message: `${message} ${NOTHING_SAVED}` };
}

const notFound = () => refuse("not_found", "This blood draw no longer exists.");
const conflict = (): SaveResult<never> => ({
  ok: false,
  error: "conflict",
  message: `${CONFLICT_MESSAGE} ${NOTHING_SAVED}`,
});

// Thrown inside a transaction to roll it back and return this refusal instead.
class Refusal extends Error {
  constructor(readonly result: SaveResult<never>) {
    super(result.ok ? "" : result.message);
  }
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function toResult(row: ResultRow): BloodResult {
  return {
    id: row.id,
    testName: row.testName,
    value: Number(row.value),
    unit: row.unit,
    rangeLow: toNumber(row.rangeLow),
    rangeHigh: toNumber(row.rangeHigh),
  };
}

async function withResults(db: Db, rows: DrawRow[]): Promise<BloodDraw[]> {
  if (rows.length === 0) return [];
  const resultRows = await db
    .select()
    .from(bloodResults)
    .where(inArray(bloodResults.drawId, rows.map((row) => row.id)))
    .orderBy(asc(bloodResults.sortOrder), asc(bloodResults.id));
  return rows.map((row) => ({
    id: row.id,
    drawnAt: row.drawnAt,
    lab: row.lab,
    notes: row.notes,
    updatedAt: row.updatedAt,
    results: resultRows.filter((result) => result.drawId === row.id).map(toResult),
  }));
}

function parseDraw(input: BloodDrawInput): { ok: true; draw: ParsedDraw } | { ok: false; result: SaveResult<never> } {
  const parsed = bloodDrawSchema.safeParse(input);
  if (parsed.success) return { ok: true, draw: parsed.data };
  const fieldErrors = bloodworkFieldErrors(parsed.error);
  return { ok: false, result: refuse("invalid", bloodworkErrorMessage(fieldErrors), fieldErrors) };
}

function resultValues(drawId: string, draw: ParsedDraw) {
  return draw.results.map((result, index) => ({
    drawId,
    testName: result.testName,
    value: String(result.value),
    unit: result.unit,
    rangeLow: result.rangeLow === null ? null : String(result.rangeLow),
    rangeHigh: result.rangeHigh === null ? null : String(result.rangeHigh),
    sortOrder: index,
  }));
}

async function inTransaction<T>(db: Db, work: (tx: Db) => Promise<SaveResult<T>>): Promise<SaveResult<T>> {
  try {
    return await db.transaction(work);
  } catch (error) {
    if (error instanceof Refusal) return error.result;
    throw error;
  }
}

// The draw and its results in one transaction: a failed result row leaves no draw behind.
export async function createDraw(db: Db, input: BloodDrawInput): Promise<SaveResult<BloodDraw>> {
  const parsed = parseDraw(input);
  if (!parsed.ok) return parsed.result;
  const { draw } = parsed;

  return inTransaction(db, async (tx) => {
    const now = new Date();
    const [row] = await tx
      .insert(bloodDraws)
      .values({ drawnAt: draw.drawnAt, lab: draw.lab, notes: draw.notes, createdAt: now, updatedAt: now })
      .returning();
    await tx.insert(bloodResults).values(resultValues(row.id, draw));
    return { ok: true, value: (await withResults(tx, [row]))[0] };
  });
}

// Replaces the draw's fields and every result row (delete, then insert), all or nothing.
// Result ids change on every edit.
export async function updateDraw(
  db: Db,
  id: string,
  expectedUpdatedAt: Date,
  input: BloodDrawInput,
): Promise<SaveResult<BloodDraw>> {
  if (!idSchema.safeParse(id).success) return notFound();
  const parsed = parseDraw(input);
  if (!parsed.ok) return parsed.result;
  if (Number.isNaN(expectedUpdatedAt.getTime())) return conflict();
  const { draw } = parsed;

  return inTransaction(db, async (tx) => {
    // Written only if the draw still has the `updated_at` the form loaded; the row stays locked
    // until commit, so a second save waits and then sees the new version.
    const [row] = await tx
      .update(bloodDraws)
      .set({ drawnAt: draw.drawnAt, lab: draw.lab, notes: draw.notes, updatedAt: new Date() })
      .where(and(eq(bloodDraws.id, id), eq(bloodDraws.updatedAt, expectedUpdatedAt)))
      .returning();
    if (!row) {
      const existing = await tx.select({ id: bloodDraws.id }).from(bloodDraws).where(eq(bloodDraws.id, id));
      throw new Refusal(existing.length > 0 ? conflict() : notFound());
    }
    await tx.delete(bloodResults).where(eq(bloodResults.drawId, id));
    await tx.insert(bloodResults).values(resultValues(id, draw));
    return { ok: true, value: (await withResults(tx, [row]))[0] };
  });
}

export async function deleteDraw(db: Db, id: string): Promise<SaveResult<{ id: string }>> {
  if (!idSchema.safeParse(id).success) return notFound();
  // Results go with it (on delete cascade).
  const deleted = await db.delete(bloodDraws).where(eq(bloodDraws.id, id)).returning({ id: bloodDraws.id });
  return deleted.length > 0 ? { ok: true, value: { id } } : notFound();
}

// Newest first.
export async function listDraws(db: Db): Promise<BloodDraw[]> {
  const rows = await db.select().from(bloodDraws).orderBy(desc(bloodDraws.drawnAt), desc(bloodDraws.id));
  return withResults(db, rows);
}

export async function getDraw(db: Db, id: string): Promise<BloodDraw | null> {
  if (!idSchema.safeParse(id).success) return null;
  const rows = await db.select().from(bloodDraws).where(eq(bloodDraws.id, id));
  return (await withResults(db, rows))[0] ?? null;
}

// One series per test and unit recorded in 2+ draws, points oldest first. A test recorded in two
// units is two series, never converted. Name and unit shown are the most recent draw's spelling.
// Series are sorted by test name, then unit.
export async function listTrendSeries(db: Db): Promise<TrendSeries[]> {
  const rows = await db
    .select({ result: bloodResults, drawnAt: bloodDraws.drawnAt })
    .from(bloodResults)
    .innerJoin(bloodDraws, eq(bloodResults.drawId, bloodDraws.id))
    .orderBy(asc(bloodDraws.drawnAt), asc(bloodDraws.id), asc(bloodResults.sortOrder));

  const series = new Map<string, TrendSeries>();
  for (const { result, drawnAt } of rows) {
    const key = trendKey(result.testName, result.unit);
    const entry = series.get(key) ?? { key, testName: result.testName, unit: result.unit, points: [] };
    // Oldest first, so the last draw seen sets the spelling shown.
    entry.testName = result.testName;
    entry.unit = result.unit;
    entry.points.push({
      drawId: result.drawId,
      drawnAt,
      value: Number(result.value),
      rangeLow: toNumber(result.rangeLow),
      rangeHigh: toNumber(result.rangeHigh),
    });
    series.set(key, entry);
  }
  return [...series.values()]
    .filter((entry) => entry.points.length >= 2)
    .sort((a, b) => a.key.localeCompare(b.key));
}
