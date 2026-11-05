import { and, asc, eq, gt, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { medicationPeriods } from "@/lib/db/schema";
import { formatDate, formatDoses } from "@/lib/format";
import { idSchema } from "@/lib/validation/seizure";
import {
  correctPeriodSchema,
  dayKeySchema,
  doseSchema,
  medicationFieldErrors,
  startMedicationSchema,
  type CorrectPeriodInput,
  type DoseInput,
  type DoseLine,
  type MedicationRole,
  type StartMedicationInput,
} from "@/lib/validation/medication";
import { CONFLICT_MESSAGE, type SaveResult } from "./result";

export type MedicationPeriod = {
  id: string;
  drugName: string;
  role: MedicationRole;
  // In the order entered; every amount is in `doseUnit`.
  doses: DoseLine[];
  doseUnit: string;
  startDate: string;
  // Exclusive; null = ongoing.
  endDate: string | null;
  note: string | null;
  updatedAt: Date;
};

export type MedicationChange = {
  date: string;
  drugName: string;
  kind: "started" | "changed" | "stopped";
  description: string;
};

const NOTHING_SAVED = "Nothing was saved.";

type PeriodRow = typeof medicationPeriods.$inferSelect;

function refuse(
  error: "invalid" | "not_found" | "conflict",
  message: string,
  fieldErrors?: Record<string, string>,
): SaveResult<never> {
  return fieldErrors
    ? { ok: false, error, message: `${message} ${NOTHING_SAVED}`, fieldErrors }
    : { ok: false, error, message: `${message} ${NOTHING_SAVED}` };
}

const notFound = () => refuse("not_found", "This medication entry no longer exists.");
const conflict = (): SaveResult<never> => ({
  ok: false,
  error: "conflict",
  message: `${CONFLICT_MESSAGE} ${NOTHING_SAVED}`,
});
const invalidFields = (error: Parameters<typeof medicationFieldErrors>[0]) =>
  refuse("invalid", "Check the fields marked below.", medicationFieldErrors(error));

// Thrown inside a transaction to roll it back and return this refusal instead.
class Refusal extends Error {
  constructor(readonly result: SaveResult<never>) {
    super(result.ok ? "" : result.message);
  }
}

// Two names are the same drug when they match ignoring case and surrounding spaces.
function drugKey(name: string): string {
  return name.trim().toLowerCase();
}

function toPeriod(row: PeriodRow): MedicationPeriod {
  return {
    id: row.id,
    drugName: row.drugName,
    // Mapped by hand: a value from an older schema reads as maintenance, never an error.
    role: row.role === "rescue" ? "rescue" : "maintenance",
    doses: row.doses.map((dose) => ({ amount: Number(dose.amount), when: String(dose.when) })),
    doseUnit: row.doseUnit,
    startDate: row.startDate,
    endDate: row.endDate,
    note: row.note,
    updatedAt: row.updatedAt,
  };
}

// Runs `work` in one transaction that first holds this drug's lock, so two saves for the same drug
// run one after the other and the second sees the first's period in its overlap check.
async function inDrugTransaction<T>(
  db: Db,
  work: (tx: Db, lockDrug: (name: string) => Promise<void>) => Promise<SaveResult<T>>,
): Promise<SaveResult<T>> {
  try {
    return await db.transaction(async (tx) => {
      const lockDrug = async (name: string) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${drugKey(name)}))`);
      };
      return work(tx, lockDrug);
    });
  } catch (error) {
    if (error instanceof Refusal) return error.result;
    throw error;
  }
}

// The earliest other period of the same drug that overlaps [startDate, endDate).
async function findOverlap(
  tx: Db,
  drugName: string,
  startDate: string,
  endDate: string | null,
  excludeIds: string[] = [],
): Promise<PeriodRow | null> {
  const rows = await tx
    .select()
    .from(medicationPeriods)
    .where(
      and(
        sql`lower(trim(${medicationPeriods.drugName})) = ${drugKey(drugName)}`,
        ...excludeIds.map((id) => ne(medicationPeriods.id, id)),
        endDate === null ? undefined : lt(medicationPeriods.startDate, endDate),
        or(isNull(medicationPeriods.endDate), gt(medicationPeriods.endDate, startDate)),
      ),
    )
    .orderBy(asc(medicationPeriods.startDate))
    .limit(1);
  return rows[0] ?? null;
}

function overlapRefusal(existing: PeriodRow, field: string): Refusal {
  const message = `He's already on ${existing.drugName} from ${formatDate(existing.startDate)}`;
  return new Refusal(refuse("invalid", `${message}.`, { [field]: message }));
}

// Locks the period's row for the rest of the transaction and checks the form's version.
async function lockCurrentPeriod(tx: Db, periodId: string, expectedUpdatedAt: Date): Promise<PeriodRow> {
  const [row] = await tx
    .select()
    .from(medicationPeriods)
    .where(eq(medicationPeriods.id, periodId))
    .for("update");
  if (!row) throw new Refusal(notFound());
  if (row.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throw new Refusal(conflict());
  return row;
}

export async function startMedication(db: Db, input: StartMedicationInput): Promise<SaveResult<MedicationPeriod>> {
  const parsed = startMedicationSchema.safeParse(input);
  if (!parsed.success) return invalidFields(parsed.error);
  const details = parsed.data;

  return inDrugTransaction(db, async (tx, lockDrug) => {
    await lockDrug(details.drugName);
    const overlap = await findOverlap(tx, details.drugName, details.startDate, null);
    if (overlap) throw overlapRefusal(overlap, "startDate");
    const now = new Date();
    const [row] = await tx
      .insert(medicationPeriods)
      .values({
        drugName: details.drugName,
        role: details.role,
        doses: details.doses,
        doseUnit: details.doseUnit,
        startDate: details.startDate,
        endDate: null,
        note: details.note,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { ok: true, value: toPeriod(row) };
  });
}

// Ends the period at `effectiveDate` and starts the new dose that day. A period that already ends
// later is split: the new dose keeps that end date.
export async function changeMedication(
  db: Db,
  periodId: string,
  expectedUpdatedAt: Date,
  effectiveDate: string,
  newDose: DoseInput,
): Promise<SaveResult<MedicationPeriod>> {
  if (!idSchema.safeParse(periodId).success) return notFound();
  const parsedDose = doseSchema.safeParse(newDose);
  const parsedDate = dayKeySchema.safeParse(effectiveDate);
  if (!parsedDate.success) {
    return refuse("invalid", "Check the fields marked below.", {
      effectiveDate: "Enter a valid date",
      ...(parsedDose.success ? {} : medicationFieldErrors(parsedDose.error)),
    });
  }
  if (!parsedDose.success) return invalidFields(parsedDose.error);
  if (Number.isNaN(expectedUpdatedAt.getTime())) return conflict();
  const dose = parsedDose.data;

  return inDrugTransaction(db, async (tx, lockDrug) => {
    const old = await lockCurrentPeriod(tx, periodId, expectedUpdatedAt);
    await lockDrug(old.drugName);
    if (effectiveDate <= old.startDate) {
      const message = `The change date must be after this dose started (${formatDate(old.startDate)})`;
      throw new Refusal(refuse("invalid", `${message}.`, { effectiveDate: message }));
    }
    if (old.endDate !== null && effectiveDate >= old.endDate) {
      const message = `This dose already ends ${formatDate(old.endDate)}; the change date must be before that`;
      throw new Refusal(refuse("invalid", `${message}.`, { effectiveDate: message }));
    }
    const overlap = await findOverlap(tx, old.drugName, effectiveDate, old.endDate, [old.id]);
    if (overlap) throw overlapRefusal(overlap, "effectiveDate");

    const now = new Date();
    await tx
      .update(medicationPeriods)
      .set({ endDate: effectiveDate, updatedAt: now })
      .where(eq(medicationPeriods.id, old.id));
    const [row] = await tx
      .insert(medicationPeriods)
      .values({
        drugName: old.drugName,
        role: old.role,
        doses: dose.doses,
        doseUnit: dose.doseUnit,
        startDate: effectiveDate,
        endDate: old.endDate,
        note: dose.note,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return { ok: true, value: toPeriod(row) };
  });
}

// Sets the end date of an ongoing period. A period that already ends is changed with `correctPeriod`.
export async function stopMedication(
  db: Db,
  periodId: string,
  expectedUpdatedAt: Date,
  stopDate: string,
): Promise<SaveResult<MedicationPeriod>> {
  if (!idSchema.safeParse(periodId).success) return notFound();
  if (!dayKeySchema.safeParse(stopDate).success) {
    return refuse("invalid", "Check the fields marked below.", { stopDate: "Enter a valid date" });
  }
  if (Number.isNaN(expectedUpdatedAt.getTime())) return conflict();

  return inDrugTransaction(db, async (tx) => {
    const old = await lockCurrentPeriod(tx, periodId, expectedUpdatedAt);
    if (stopDate <= old.startDate) {
      const message = `The stop date must be after this dose started (${formatDate(old.startDate)})`;
      throw new Refusal(refuse("invalid", `${message}.`, { stopDate: message }));
    }
    if (old.endDate !== null) {
      const message = `This dose already ends ${formatDate(old.endDate)}. Use Fix a mistake to change that date`;
      throw new Refusal(refuse("invalid", `${message}.`, { stopDate: message }));
    }
    const [row] = await tx
      .update(medicationPeriods)
      .set({ endDate: stopDate, updatedAt: new Date() })
      .where(eq(medicationPeriods.id, old.id))
      .returning();
    return { ok: true, value: toPeriod(row) };
  });
}

// Fixes a typo in place: every field can change, with the same overlap check as a new period.
export async function correctPeriod(
  db: Db,
  periodId: string,
  expectedUpdatedAt: Date,
  input: CorrectPeriodInput,
): Promise<SaveResult<MedicationPeriod>> {
  if (!idSchema.safeParse(periodId).success) return notFound();
  const parsed = correctPeriodSchema.safeParse(input);
  if (!parsed.success) return invalidFields(parsed.error);
  if (Number.isNaN(expectedUpdatedAt.getTime())) return conflict();
  const details = parsed.data;

  return inDrugTransaction(db, async (tx, lockDrug) => {
    await lockCurrentPeriod(tx, periodId, expectedUpdatedAt);
    await lockDrug(details.drugName);
    const overlap = await findOverlap(tx, details.drugName, details.startDate, details.endDate, [periodId]);
    if (overlap) throw overlapRefusal(overlap, "startDate");
    const [row] = await tx
      .update(medicationPeriods)
      .set({
        drugName: details.drugName,
        role: details.role,
        doses: details.doses,
        doseUnit: details.doseUnit,
        startDate: details.startDate,
        endDate: details.endDate,
        note: details.note,
        updatedAt: new Date(),
      })
      .where(eq(medicationPeriods.id, periodId))
      .returning();
    return { ok: true, value: toPeriod(row) };
  });
}

export async function deletePeriod(db: Db, periodId: string): Promise<SaveResult<{ id: string }>> {
  if (!idSchema.safeParse(periodId).success) return notFound();
  const deleted = await db
    .delete(medicationPeriods)
    .where(eq(medicationPeriods.id, periodId))
    .returning({ id: medicationPeriods.id });
  return deleted.length > 0 ? { ok: true, value: { id: periodId } } : notFound();
}

// Periods in effect on `onDate`: start <= onDate < end (or no end), by drug name.
export async function listCurrentMedications(db: Db, onDate: string): Promise<MedicationPeriod[]> {
  const rows = await db
    .select()
    .from(medicationPeriods)
    .where(
      and(
        lte(medicationPeriods.startDate, onDate),
        or(isNull(medicationPeriods.endDate), gt(medicationPeriods.endDate, onDate)),
      ),
    )
    .orderBy(sql`lower(trim(${medicationPeriods.drugName}))`, asc(medicationPeriods.startDate));
  return rows.map(toPeriod);
}

// Every period, by drug name, then start date.
export async function listMedicationHistory(db: Db): Promise<MedicationPeriod[]> {
  const rows = await db
    .select()
    .from(medicationPeriods)
    .orderBy(sql`lower(trim(${medicationPeriods.drugName}))`, asc(medicationPeriods.startDate), asc(medicationPeriods.id));
  return rows.map(toPeriod);
}

// "60 mg" for a single time (its schedule left out, as on the calendar so far); every time for several.
function formatDose(period: MedicationPeriod): string {
  return period.doses.length === 1 ? `${period.doses[0].amount} ${period.doseUnit}` : formatDoses(period.doses, period.doseUnit);
}

function sameDoses(a: MedicationPeriod, b: MedicationPeriod): boolean {
  return a.doseUnit === b.doseUnit && a.doses.length === b.doses.length &&
    a.doses.every((dose, index) => dose.amount === b.doses[index].amount && dose.when === b.doses[index].when);
}

// What a dose change changed, after the drug name. Same unit and times: only the amounts that
// moved ("evening 625 mg → 750 mg"). One time with a new schedule: "75 mg: twice daily → three times daily".
function describeChange(before: MedicationPeriod, after: MedicationPeriod): string {
  if (sameDoses(before, after)) return formatDose(after);
  const unit = after.doseUnit;
  const sameTimes = before.doseUnit === unit && before.doses.length === after.doses.length &&
    before.doses.every((dose, index) => dose.when === after.doses[index].when);
  if (sameTimes) {
    if (after.doses.length === 1) return `${before.doses[0].amount} ${unit} → ${after.doses[0].amount} ${unit}`;
    return after.doses
      .flatMap((dose, index) => {
        const was = before.doses[index].amount;
        return was === dose.amount ? [] : [`${dose.when} ${was} ${unit} → ${dose.amount} ${unit}`];
      })
      .join(", ");
  }
  if (before.doses.length === 1 && after.doses.length === 1) {
    return formatDose(before) === formatDose(after)
      ? `${formatDose(after)}: ${before.doses[0].when} → ${after.doses[0].when}`
      : `${formatDose(before)} → ${formatDose(after)}`;
  }
  return `${formatDoses(before.doses, before.doseUnit)} → ${formatDoses(after.doses, unit)}`;
}

// Starts, dose changes and stops dated in [fromDate, toDate), by date then drug name.
// A period starting the day another period of the same drug ends is a change; one with no
// predecessor is a start; an end date with no successor is a stop.
export async function listMedicationChanges(db: Db, fromDate: string, toDate: string): Promise<MedicationChange[]> {
  const periods = await listMedicationHistory(db);
  const changes: MedicationChange[] = [];
  for (const period of periods) {
    const sameDrug = periods.filter((other) => other.id !== period.id && drugKey(other.drugName) === drugKey(period.drugName));
    const predecessor = sameDrug.find((other) => other.endDate === period.startDate);
    if (predecessor) {
      changes.push({
        date: period.startDate,
        drugName: period.drugName,
        kind: "changed",
        description: `${period.drugName} ${describeChange(predecessor, period)}`,
      });
    } else {
      changes.push({
        date: period.startDate,
        drugName: period.drugName,
        kind: "started",
        description: `Started ${period.drugName} ${formatDose(period)}`,
      });
    }
    if (period.endDate !== null && !sameDrug.some((other) => other.startDate === period.endDate)) {
      changes.push({
        date: period.endDate,
        drugName: period.drugName,
        kind: "stopped",
        description: `Stopped ${period.drugName}`,
      });
    }
  }
  return changes
    .filter((change) => change.date >= fromDate && change.date < toDate)
    .sort((a, b) => a.date.localeCompare(b.date) || drugKey(a.drugName).localeCompare(drugKey(b.drugName)));
}
