import { and, asc, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { seizureResponses, seizures } from "@/lib/db/schema";
import {
  fieldErrorsFrom,
  idSchema,
  MAX_FUTURE_START_MS,
  MAX_SEIZURE_SECONDS,
  responseSchema,
  SEIZURE_TYPES,
  seizureDetailsSchema,
  SEVERITIES,
  startSeizureSchema,
  type ResponseInput,
  type SeizureDetailsInput,
  type SeizureType,
  type Severity,
} from "@/lib/validation/seizure";
import { CONFLICT_MESSAGE, type SaveResult } from "./result";

export type SeizureResponse = {
  id: string;
  kind: "rescue_med" | "other";
  medicationName: string | null;
  doseAmount: number | null;
  doseUnit: string | null;
  givenAt: Date | null;
  description: string | null;
};

export type Seizure = {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  seizureType: SeizureType | null;
  severity: Severity | null;
  beforeSymptoms: string | null;
  afterSymptoms: string | null;
  triggers: string | null;
  notes: string | null;
  recoveryMinutes: number | null;
  updatedAt: Date;
  responses: SeizureResponse[];
};

const NOTHING_SAVED = "Nothing was saved.";

type SeizureRow = typeof seizures.$inferSelect;
type ResponseRow = typeof seizureResponses.$inferSelect;

function refuse(
  error: "invalid" | "not_found" | "conflict",
  message: string,
  fieldErrors?: Record<string, string>,
): SaveResult<never> {
  return fieldErrors
    ? { ok: false, error, message: `${message} ${NOTHING_SAVED}`, fieldErrors }
    : { ok: false, error, message: `${message} ${NOTHING_SAVED}` };
}

const notFound = () => refuse("not_found", "This seizure no longer exists.");
const conflict = (): SaveResult<never> => ({
  ok: false,
  error: "conflict",
  message: `${CONFLICT_MESSAGE} ${NOTHING_SAVED}`,
});

// Enum text is mapped by hand: a value from an older schema becomes null, never an error.
function toSeizureType(value: string | null): SeizureType | null {
  return SEIZURE_TYPES.find((type) => type === value) ?? null;
}

function toSeverity(value: string | null): Severity | null {
  return SEVERITIES.find((severity) => severity === value) ?? null;
}

function toNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function toResponse(row: ResponseRow): SeizureResponse {
  return {
    id: row.id,
    kind: row.kind === "rescue_med" ? "rescue_med" : "other",
    medicationName: row.medicationName,
    doseAmount: toNumber(row.doseAmount),
    doseUnit: row.doseUnit,
    givenAt: row.givenAt,
    description: row.description,
  };
}

function toSeizure(row: SeizureRow, responses: ResponseRow[]): Seizure {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    seizureType: toSeizureType(row.seizureType),
    severity: toSeverity(row.severity),
    beforeSymptoms: row.beforeSymptoms,
    afterSymptoms: row.afterSymptoms,
    triggers: row.triggers,
    notes: row.notes,
    recoveryMinutes: row.recoveryMinutes,
    updatedAt: row.updatedAt,
    responses: responses.map(toResponse),
  };
}

async function withResponses(db: Db, rows: SeizureRow[]): Promise<Seizure[]> {
  if (rows.length === 0) return [];
  const responseRows = await db
    .select()
    .from(seizureResponses)
    .where(inArray(seizureResponses.seizureId, rows.map((row) => row.id)))
    .orderBy(asc(seizureResponses.createdAt), asc(seizureResponses.id));
  return rows.map((row) =>
    toSeizure(
      row,
      responseRows.filter((response) => response.seizureId === row.id),
    ),
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ((current as { code?: string }).code === "23503") return true;
  }
  return false;
}

export async function getSeizure(db: Db, id: string): Promise<Seizure | null> {
  if (!idSchema.safeParse(id).success) return null;
  const rows = await db.select().from(seizures).where(eq(seizures.id, id));
  return (await withResponses(db, rows))[0] ?? null;
}

// Not stopped, and started within the last 2 hours (after that it shows "Duration not recorded").
export async function getActiveSeizure(db: Db, now: Date = new Date()): Promise<Seizure | null> {
  const since = new Date(now.getTime() - MAX_SEIZURE_SECONDS * 1000);
  const rows = await db
    .select()
    .from(seizures)
    .where(and(isNull(seizures.endedAt), gte(seizures.startedAt, since)))
    .orderBy(desc(seizures.startedAt))
    .limit(1);
  return (await withResponses(db, rows))[0] ?? null;
}

export async function getLastSeizure(db: Db): Promise<Seizure | null> {
  const rows = await db.select().from(seizures).orderBy(desc(seizures.startedAt)).limit(1);
  return (await withResponses(db, rows))[0] ?? null;
}

// `started_at` in [from, to), ascending.
export async function listSeizuresBetween(db: Db, from: Date, to: Date): Promise<Seizure[]> {
  const rows = await db
    .select()
    .from(seizures)
    .where(and(gte(seizures.startedAt, from), lt(seizures.startedAt, to)))
    .orderBy(asc(seizures.startedAt), asc(seizures.id));
  return withResponses(db, rows);
}

export async function createSeizure(
  db: Db,
  input: { id: string; startedAt: Date },
): Promise<SaveResult<Seizure>> {
  const parsed = startSeizureSchema.safeParse(input);
  if (!parsed.success) {
    return refuse("invalid", "Check the seizure start.", fieldErrorsFrom(parsed.error));
  }
  const { id, startedAt } = parsed.data;
  const now = new Date();
  if (startedAt.getTime() > now.getTime() + MAX_FUTURE_START_MS) {
    return refuse("invalid", "The start time is in the future.", {
      startedAt: "The start time can't be more than 5 minutes in the future",
    });
  }
  // Same id again (a double-tap or a retry): the stored row wins and nothing new is written.
  await db
    .insert(seizures)
    .values({ id, startedAt, createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: seizures.id });
  const stored = await getSeizure(db, id);
  return stored ? { ok: true, value: stored } : notFound();
}

export async function stopSeizure(db: Db, id: string, endedAt: Date): Promise<SaveResult<Seizure>> {
  if (!idSchema.safeParse(id).success) return notFound();
  if (Number.isNaN(endedAt.getTime())) {
    return refuse("invalid", "The stop time isn't valid.", { endedAt: "Enter a valid date and time" });
  }
  const existing = await getSeizure(db, id);
  if (!existing) return notFound();
  // Already stopped: success, with the first stop time kept.
  if (existing.endedAt) return { ok: true, value: existing };

  const rangeError = endTimeError(existing.startedAt, endedAt);
  if (rangeError) return refuse("invalid", rangeError, { endedAt: rangeError });

  // One statement: only an unstopped row is updated, so two stops can't overwrite each other.
  const updated = await db
    .update(seizures)
    .set({ endedAt, updatedAt: new Date() })
    .where(and(eq(seizures.id, id), isNull(seizures.endedAt)))
    .returning();
  if (updated.length > 0) return { ok: true, value: (await withResponses(db, updated))[0] };

  // Lost a race: it was stopped or deleted in between.
  const current = await getSeizure(db, id);
  return current ? { ok: true, value: current } : notFound();
}

function endTimeError(startedAt: Date, endedAt: Date): string | null {
  const seconds = (endedAt.getTime() - startedAt.getTime()) / 1000;
  if (seconds <= 0) return "The end time must be after the start time";
  if (seconds > MAX_SEIZURE_SECONDS) return "A seizure can't last more than 2 hours";
  return null;
}

export async function updateSeizure(
  db: Db,
  id: string,
  expectedUpdatedAt: Date,
  input: SeizureDetailsInput,
): Promise<SaveResult<Seizure>> {
  if (!idSchema.safeParse(id).success) return notFound();
  const parsed = seizureDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return refuse("invalid", "Check the fields marked below.", fieldErrorsFrom(parsed.error));
  }
  if (Number.isNaN(expectedUpdatedAt.getTime())) return conflict();
  const details = parsed.data;

  const existing = await getSeizure(db, id);
  if (!existing) return notFound();
  // A stale form is refused before anything else is looked at.
  if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return conflict();

  const now = new Date();
  const startedAt = details.startedAt ?? existing.startedAt;
  if (startedAt.getTime() > now.getTime() + MAX_FUTURE_START_MS) {
    const message = "The start time can't be more than 5 minutes in the future";
    return refuse("invalid", message, { startedAt: message });
  }

  // endedAt wins over a duration. A blank end leaves the seizure as it was (never clears a stop).
  let endedAt: Date | null = existing.endedAt;
  let endField = "endedAt";
  if (details.endedAt) {
    endedAt = details.endedAt;
  } else if (details.durationSeconds) {
    endedAt = new Date(startedAt.getTime() + details.durationSeconds * 1000);
    endField = "durationSeconds";
  }
  if (endedAt) {
    const rangeError = endTimeError(startedAt, endedAt);
    if (rangeError) return refuse("invalid", rangeError, { [endField]: rangeError });
  }

  // One statement: the row is written only if it still has the `updated_at` the form loaded.
  const updated = await db
    .update(seizures)
    .set({
      startedAt,
      endedAt,
      seizureType: details.seizureType,
      severity: details.severity,
      beforeSymptoms: details.beforeSymptoms,
      afterSymptoms: details.afterSymptoms,
      triggers: details.triggers,
      notes: details.notes,
      recoveryMinutes: details.recoveryMinutes,
      updatedAt: now,
    })
    .where(and(eq(seizures.id, id), eq(seizures.updatedAt, expectedUpdatedAt)))
    .returning();
  if (updated.length > 0) return { ok: true, value: (await withResponses(db, updated))[0] };

  return (await getSeizure(db, id)) ? conflict() : notFound();
}

export async function deleteSeizure(db: Db, id: string): Promise<SaveResult<{ id: string }>> {
  if (!idSchema.safeParse(id).success) return notFound();
  // Responses go with it (on delete cascade).
  const deleted = await db.delete(seizures).where(eq(seizures.id, id)).returning({ id: seizures.id });
  return deleted.length > 0 ? { ok: true, value: { id } } : notFound();
}

export async function addResponse(
  db: Db,
  seizureId: string,
  input: ResponseInput,
): Promise<SaveResult<SeizureResponse>> {
  if (!idSchema.safeParse(seizureId).success) return notFound();
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) {
    return refuse("invalid", "Check the fields marked below.", fieldErrorsFrom(parsed.error));
  }
  const details = parsed.data;
  const now = new Date();
  try {
    const [row] = await db
      .insert(seizureResponses)
      .values({
        seizureId,
        kind: details.kind,
        medicationName: details.medicationName,
        doseAmount: details.doseAmount === null ? null : String(details.doseAmount),
        doseUnit: details.doseUnit,
        givenAt: details.givenAt,
        description: details.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { ok: true, value: toResponse(row) };
  } catch (error) {
    // The seizure was deleted: never leave a response without one.
    if (isForeignKeyViolation(error)) return notFound();
    throw error;
  }
}

export async function deleteResponse(db: Db, responseId: string): Promise<SaveResult<{ id: string }>> {
  if (!idSchema.safeParse(responseId).success) {
    return refuse("not_found", "This response no longer exists.");
  }
  const deleted = await db
    .delete(seizureResponses)
    .where(eq(seizureResponses.id, responseId))
    .returning({ id: seizureResponses.id });
  return deleted.length > 0
    ? { ok: true, value: { id: responseId } }
    : refuse("not_found", "This response no longer exists.");
}
