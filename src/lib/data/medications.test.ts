import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { medicationPeriods } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import {
  changeMedication,
  correctPeriod,
  deletePeriod,
  listCurrentMedications,
  listMedicationChanges,
  listMedicationHistory,
  startMedication,
  stopMedication,
  type MedicationPeriod,
} from "./medications";

const pheno = {
  drugName: "Phenobarbital",
  role: "maintenance" as const,
  doseAmount: 60,
  doseUnit: "mg",
  schedule: "twice daily",
  startDate: "2026-01-10",
};

function value<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(`save failed: ${result.message}`);
  return result.value;
}

async function startPheno(db: Db, overrides: Partial<typeof pheno> = {}): Promise<MedicationPeriod> {
  return value(await startMedication(db, { ...pheno, ...overrides }));
}

async function rows(db: Db) {
  return db.select().from(medicationPeriods).orderBy(medicationPeriods.startDate);
}

describe("startMedication", () => {
  it("saves a period with numbers as numbers and no end", async () => {
    const db = await createTestDb();
    const period = await startPheno(db, { drugName: "  Phenobarbital  " });
    expect(period).toMatchObject({ drugName: "Phenobarbital", doseAmount: 60, endDate: null, note: null });
  });

  it("refuses missing fields and a dose that isn't positive, writing nothing", async () => {
    const db = await createTestDb();
    const missing = await startMedication(db, { ...pheno, drugName: " ", schedule: "" });
    expect(missing).toMatchObject({ ok: false, error: "invalid" });
    expect(missing.ok ? null : Object.keys(missing.fieldErrors ?? {}).sort()).toEqual(["drugName", "schedule"]);
    expect(await startMedication(db, { ...pheno, doseAmount: 0 })).toMatchObject({ ok: false, error: "invalid" });
    // More than 3 decimal places would be silently rounded by numeric(10,3); refuse it instead.
    expect(await startMedication(db, { ...pheno, doseAmount: 10.1239 })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { doseAmount: expect.any(String) },
    });
    expect(await startMedication(db, { ...pheno, startDate: "2026-02-30" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await rows(db)).toEqual([]);
  });

  it("refuses a period overlapping the same drug, ignoring case and spaces", async () => {
    const db = await createTestDb();
    await startPheno(db);
    const result = await startMedication(db, { ...pheno, drugName: " phenobarbital", startDate: "2026-03-01" });
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { startDate: "He's already on Phenobarbital from Sat, Jan 10, 2026" },
    });
    expect(await rows(db)).toHaveLength(1);
  });

  it("allows a restart after a stop, and a start in the future", async () => {
    const db = await createTestDb();
    const first = await startPheno(db);
    value(await stopMedication(db, first.id, first.updatedAt, "2026-02-01"));
    expect((await startMedication(db, { ...pheno, startDate: "2026-02-01" })).ok).toBe(true);
    expect((await startMedication(db, { ...pheno, drugName: "Keppra", startDate: "2099-01-01" })).ok).toBe(true);
  });
});

describe("changeMedication", () => {
  it("ends the old period and starts the new one on the same date", async () => {
    const db = await createTestDb();
    const old = await startPheno(db);
    const next = value(
      await changeMedication(db, old.id, old.updatedAt, "2026-03-01", { doseAmount: 75, doseUnit: "mg", schedule: "twice daily" }),
    );
    expect(next).toMatchObject({ drugName: "Phenobarbital", role: "maintenance", doseAmount: 75, startDate: "2026-03-01", endDate: null });
    const stored = await rows(db);
    expect(stored.map((row) => [row.startDate, row.endDate])).toEqual([
      ["2026-01-10", "2026-03-01"],
      ["2026-03-01", null],
    ]);

    const onChangeDay = await listCurrentMedications(db, "2026-03-01");
    expect(onChangeDay.map((period) => period.doseAmount)).toEqual([75]);
    const dayBefore = await listCurrentMedications(db, "2026-02-28");
    expect(dayBefore.map((period) => period.doseAmount)).toEqual([60]);
  });

  it("refuses a change on or before the period's start, and a stale form", async () => {
    const db = await createTestDb();
    const old = await startPheno(db);
    const dose = { doseAmount: 75, doseUnit: "mg", schedule: "twice daily" };
    expect(await changeMedication(db, old.id, old.updatedAt, "2026-01-10", dose)).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { effectiveDate: expect.any(String) },
    });
    expect(await changeMedication(db, old.id, new Date(old.updatedAt.getTime() - 1), "2026-03-01", dose)).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(await rows(db)).toHaveLength(1);
    expect((await rows(db))[0].endDate).toBeNull();
  });

  it("splits a period that already ends later, keeping its end", async () => {
    const db = await createTestDb();
    const old = await startPheno(db);
    const stopped = value(await stopMedication(db, old.id, old.updatedAt, "2026-06-01"));
    const dose = { doseAmount: 75, doseUnit: "mg", schedule: "twice daily" };
    expect(await changeMedication(db, old.id, stopped.updatedAt, "2026-06-01", dose)).toMatchObject({ ok: false, error: "invalid" });
    const next = value(await changeMedication(db, old.id, stopped.updatedAt, "2026-03-01", dose));
    expect(next).toMatchObject({ startDate: "2026-03-01", endDate: "2026-06-01" });
  });

  it("leaves the old period open when inserting the new one fails", async () => {
    const db = await createTestDb();
    const old = await startPheno(db);
    // Make any insert with this unit fail inside the change's transaction.
    await db.execute(sql`
      create function refuse_boom() returns trigger language plpgsql as $$
      begin
        if new.dose_unit = 'boom' then raise exception 'insert refused'; end if;
        return new;
      end $$`);
    await db.execute(sql`
      create trigger refuse_boom before insert on medication_periods
      for each row execute function refuse_boom()`);

    await expect(
      changeMedication(db, old.id, old.updatedAt, "2026-03-01", { doseAmount: 75, doseUnit: "boom", schedule: "twice daily" }),
    ).rejects.toThrow();
    const [stored] = await db.select().from(medicationPeriods).where(eq(medicationPeriods.id, old.id));
    expect(stored.endDate).toBeNull();
    expect(stored.updatedAt).toEqual(old.updatedAt);
    expect(await rows(db)).toHaveLength(1);
  });
});

describe("stopMedication", () => {
  it("sets the end date, and refuses one on or before the start or on a period already ended", async () => {
    const db = await createTestDb();
    const old = await startPheno(db);
    expect(await stopMedication(db, old.id, old.updatedAt, "2026-01-10")).toMatchObject({ ok: false, error: "invalid" });
    const stopped = value(await stopMedication(db, old.id, old.updatedAt, "2026-02-01"));
    expect(stopped.endDate).toBe("2026-02-01");
    expect(await stopMedication(db, old.id, stopped.updatedAt, "2026-03-01")).toMatchObject({ ok: false, error: "invalid" });
    expect(await listCurrentMedications(db, "2026-02-01")).toEqual([]);
  });

  it("returns not_found for an unknown id", async () => {
    const db = await createTestDb();
    expect(await stopMedication(db, crypto.randomUUID(), new Date(), "2026-02-01")).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("correctPeriod", () => {
  it("fixes fields in place and refuses an overlap with another period of the same drug", async () => {
    const db = await createTestDb();
    const first = await startPheno(db);
    const second = value(
      await changeMedication(db, first.id, first.updatedAt, "2026-03-01", { doseAmount: 75, doseUnit: "mg", schedule: "twice daily" }),
    );
    const fixed = value(
      await correctPeriod(db, second.id, second.updatedAt, { ...pheno, doseAmount: 70, startDate: "2026-03-01", endDate: null }),
    );
    expect(fixed).toMatchObject({ id: second.id, doseAmount: 70 });

    const overlapping = await correctPeriod(db, fixed.id, fixed.updatedAt, { ...pheno, startDate: "2026-02-01", endDate: null });
    expect(overlapping).toMatchObject({ ok: false, error: "invalid", fieldErrors: { startDate: expect.stringContaining("already on") } });
    expect(await correctPeriod(db, fixed.id, second.updatedAt, { ...pheno, startDate: "2026-03-01" })).toMatchObject({
      ok: false,
      error: "conflict",
    });
    expect(await correctPeriod(db, fixed.id, fixed.updatedAt, { ...pheno, startDate: "2026-03-01", endDate: "2026-03-01" })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { endDate: expect.any(String) },
    });
  });
});

describe("deletePeriod", () => {
  it("deletes once, then returns not_found", async () => {
    const db = await createTestDb();
    const period = await startPheno(db);
    expect(await deletePeriod(db, period.id)).toEqual({ ok: true, value: { id: period.id } });
    expect(await deletePeriod(db, period.id)).toMatchObject({ ok: false, error: "not_found" });
    expect(await listMedicationHistory(db)).toEqual([]);
  });
});

describe("listMedicationChanges", () => {
  it("labels started, changed and stopped, within [from, to)", async () => {
    const db = await createTestDb();
    const first = await startPheno(db);
    const second = value(
      await changeMedication(db, first.id, first.updatedAt, "2026-03-01", { doseAmount: 75, doseUnit: "mg", schedule: "twice daily" }),
    );
    const third = value(
      await changeMedication(db, second.id, second.updatedAt, "2026-03-15", { doseAmount: 75, doseUnit: "mg", schedule: "three times daily" }),
    );
    value(await stopMedication(db, third.id, third.updatedAt, "2026-04-01"));
    await startMedication(db, { ...pheno, drugName: "Levetiracetam", role: "rescue", doseAmount: 500, startDate: "2026-03-15" });

    expect(await listMedicationChanges(db, "2026-01-01", "2026-12-31")).toEqual([
      { date: "2026-01-10", drugName: "Phenobarbital", kind: "started", description: "Started Phenobarbital 60 mg" },
      { date: "2026-03-01", drugName: "Phenobarbital", kind: "changed", description: "Phenobarbital 60 mg → 75 mg" },
      { date: "2026-03-15", drugName: "Levetiracetam", kind: "started", description: "Started Levetiracetam 500 mg" },
      {
        date: "2026-03-15",
        drugName: "Phenobarbital",
        kind: "changed",
        description: "Phenobarbital 75 mg: twice daily → three times daily",
      },
      { date: "2026-04-01", drugName: "Phenobarbital", kind: "stopped", description: "Stopped Phenobarbital" },
    ]);
    const march = await listMedicationChanges(db, "2026-03-01", "2026-04-01");
    expect(march.map((change) => change.date)).toEqual(["2026-03-01", "2026-03-15", "2026-03-15"]);
  });

  it("does not describe an unchanged dose and schedule as an arrow change", async () => {
    const db = await createTestDb();
    const first = await startPheno(db);
    value(
      await changeMedication(db, first.id, first.updatedAt, "2026-03-01", {
        doseAmount: 60,
        doseUnit: "mg",
        schedule: "twice daily",
        note: "note only",
      }),
    );
    const changes = await listMedicationChanges(db, "2026-01-01", "2026-12-31");
    expect(changes.find((change) => change.date === "2026-03-01")?.description).toBe("Phenobarbital 60 mg");
  });
});
