import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
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
import type { DoseInput, StartMedicationInput } from "@/lib/validation/medication";

// One dose line: `amount` mg at `when`.
function dose(amount: number, when = "twice daily", extra: Partial<DoseInput> = {}): DoseInput {
  return { doses: [{ amount, when }], doseUnit: "mg", ...extra };
}

const pheno = {
  drugName: "Phenobarbital",
  role: "maintenance" as const,
  ...dose(60),
  startDate: "2026-01-10",
};

const split = { doses: [{ amount: 500, when: "morning" }, { amount: 625, when: "evening" }], doseUnit: "mg" };

function value<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(`save failed: ${result.message}`);
  return result.value;
}

async function startPheno(db: Db, overrides: Partial<StartMedicationInput> = {}): Promise<MedicationPeriod> {
  return value(await startMedication(db, { ...pheno, ...overrides }));
}

async function rows(db: Db) {
  return db.select().from(medicationPeriods).orderBy(medicationPeriods.startDate);
}

describe("startMedication", () => {
  it("saves a period with numbers as numbers and no end", async () => {
    const db = await createTestDb();
    const period = await startPheno(db, { drugName: "  Phenobarbital  " });
    expect(period).toMatchObject({ drugName: "Phenobarbital", doses: [{ amount: 60, when: "twice daily" }], endDate: null, note: null });
  });

  it("refuses missing fields and a dose that isn't positive, writing nothing", async () => {
    const db = await createTestDb();
    const missing = await startMedication(db, { ...pheno, drugName: " ", doses: [{ amount: 60, when: "" }] });
    expect(missing).toMatchObject({ ok: false, error: "invalid" });
    expect(missing.ok ? null : Object.keys(missing.fieldErrors ?? {}).sort()).toEqual(["doses.0.when", "drugName"]);
    expect(await startMedication(db, { ...pheno, ...dose(0) })).toMatchObject({ ok: false, error: "invalid" });
    // More than 3 decimal places would be stored as a different dose than typed; refuse it instead.
    expect(await startMedication(db, { ...pheno, ...dose(10.1239) })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { "doses.0.amount": expect.any(String) },
    });
    // Within a thousandth of a valid dose is still more than 3 places: refused, not rounded.
    expect(await startMedication(db, { ...pheno, ...dose(10.1230005) })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { "doses.0.amount": expect.any(String) },
    });
    expect(await startMedication(db, { ...pheno, startDate: "2026-02-30" })).toMatchObject({ ok: false, error: "invalid" });
    expect(await rows(db)).toEqual([]);
  });

  it("stores doses with up to 3 decimal places exactly", async () => {
    const db = await createTestDb();
    for (const [drugName, amount] of [["A", 1.005], ["B", 0.001], ["C", 2.675], ["D", 9_999_999]] as const) {
      expect(await startPheno(db, { drugName, ...dose(amount) })).toMatchObject({ doses: [{ amount }] });
    }
    expect((await listMedicationHistory(db)).map((period) => period.doses[0].amount)).toEqual([1.005, 0.001, 2.675, 9_999_999]);
  });

  it("keeps several doses at different times in the order entered, ignoring blank rows", async () => {
    const db = await createTestDb();
    const period = await startPheno(db, {
      drugName: "Keppra",
      doseUnit: "mg",
      doses: [{ amount: 500, when: " morning " }, {}, { amount: null, when: "  " }, { amount: 625, when: "evening" }],
    });
    expect(period.doses).toEqual(split.doses);
    expect((await listMedicationHistory(db))[0].doses).toEqual(split.doses);
  });

  it("refuses each bad dose row on that row's form index, writing nothing", async () => {
    const db = await createTestDb();
    const cases: [DoseInput["doses"], Record<string, string>][] = [
      [[{ amount: 500, when: "morning" }, {}, { when: "evening" }], { "doses.2.amount": "Enter the dose" }],
      [[{ amount: 500 }], { "doses.0.when": "Enter when it's given, like morning" }],
      [[{ amount: 500, when: "Morning" }, { amount: 625, when: " morning" }], { "doses.1.when": "This time is already in row 1" }],
      [[{}, { amount: null, when: "" }], { "doses.0.amount": "Enter the dose" }],
      [[], { "doses.0.amount": "Enter the dose" }],
    ];
    for (const [doses, fieldErrors] of cases) {
      const result = await startMedication(db, { ...pheno, doses });
      expect(result).toMatchObject({ ok: false, error: "invalid", fieldErrors });
    }
    const nine = Array.from({ length: 9 }, (_, index) => ({ amount: 1, when: `time ${index}` }));
    expect(await startMedication(db, { ...pheno, doses: nine })).toMatchObject({ ok: false, error: "invalid" });
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
      await changeMedication(db, old.id, old.updatedAt, "2026-03-01", dose(75)),
    );
    expect(next).toMatchObject({ drugName: "Phenobarbital", role: "maintenance", doses: [{ amount: 75 }], startDate: "2026-03-01", endDate: null });
    const stored = await rows(db);
    expect(stored.map((row) => [row.startDate, row.endDate])).toEqual([
      ["2026-01-10", "2026-03-01"],
      ["2026-03-01", null],
    ]);

    const onChangeDay = await listCurrentMedications(db, "2026-03-01");
    expect(onChangeDay.map((period) => period.doses[0].amount)).toEqual([75]);
    const dayBefore = await listCurrentMedications(db, "2026-02-28");
    expect(dayBefore.map((period) => period.doses[0].amount)).toEqual([60]);
  });

  it("refuses a change on or before the period's start, and a stale form", async () => {
    const db = await createTestDb();
    const old = await startPheno(db);
    const newDose = dose(75);
    expect(await changeMedication(db, old.id, old.updatedAt, "2026-01-10", newDose)).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { effectiveDate: expect.any(String) },
    });
    expect(await changeMedication(db, old.id, new Date(old.updatedAt.getTime() - 1), "2026-03-01", newDose)).toMatchObject({
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
    const newDose = dose(75);
    expect(await changeMedication(db, old.id, stopped.updatedAt, "2026-06-01", newDose)).toMatchObject({ ok: false, error: "invalid" });
    const next = value(await changeMedication(db, old.id, stopped.updatedAt, "2026-03-01", newDose));
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
      changeMedication(db, old.id, old.updatedAt, "2026-03-01", dose(75, "twice daily", { doseUnit: "boom" })),
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
      await changeMedication(db, first.id, first.updatedAt, "2026-03-01", dose(75)),
    );
    const fixed = value(
      await correctPeriod(db, second.id, second.updatedAt, { ...pheno, ...dose(70), startDate: "2026-03-01", endDate: null }),
    );
    expect(fixed).toMatchObject({ id: second.id, doses: [{ amount: 70 }] });

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
      await changeMedication(db, first.id, first.updatedAt, "2026-03-01", dose(75)),
    );
    const third = value(
      await changeMedication(db, second.id, second.updatedAt, "2026-03-15", dose(75, "three times daily")),
    );
    value(await stopMedication(db, third.id, third.updatedAt, "2026-04-01"));
    await startMedication(db, { ...pheno, drugName: "Levetiracetam", role: "rescue", ...dose(500), startDate: "2026-03-15" });

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
      await changeMedication(db, first.id, first.updatedAt, "2026-03-01", dose(60, "twice daily", { note: "note only" })),
    );
    const changes = await listMedicationChanges(db, "2026-01-01", "2026-12-31");
    expect(changes.find((change) => change.date === "2026-03-01")?.description).toBe("Phenobarbital 60 mg");
  });

  it("names only the times whose amount moved, and lists every time otherwise", async () => {
    const db = await createTestDb();
    const at = (amounts: number[], whens = ["morning", "evening"]) => ({
      doses: amounts.map((amount, index) => ({ amount, when: whens[index] })), doseUnit: "mg",
    });
    let period = await startPheno(db, { drugName: "Keppra", ...split, startDate: "2026-01-01" });
    const steps: [string, DoseInput][] = [
      ["2026-02-01", at([500, 750])],
      ["2026-03-01", at([625, 875])],
      ["2026-04-01", at([625, 875])],
      ["2026-05-01", at([1500], ["once daily"])],
      ["2026-06-01", at([750, 750], ["morning", "night"])],
    ];
    for (const [date, next] of steps) period = value(await changeMedication(db, period.id, period.updatedAt, date, next));
    expect((await listMedicationChanges(db, "2026-01-01", "2026-12-31")).map((change) => change.description)).toEqual([
      "Started Keppra 500 mg morning, 625 mg evening",
      "Keppra evening 625 mg → 750 mg",
      "Keppra morning 500 mg → 625 mg, evening 750 mg → 875 mg",
      "Keppra 625 mg morning, 875 mg evening",
      "Keppra 625 mg morning, 875 mg evening → 1500 mg once daily",
      "Keppra 1500 mg once daily → 750 mg morning, 750 mg night",
    ]);
  });
});

// The production upgrade: periods saved before split doses (one amount and a schedule) must each
// come through the migrations as one dose line, with nothing dropped.
describe("dose-list migration", () => {
  it("converts every existing period to one dose line", async () => {
    const pg = new PGlite();
    const dir = path.join(process.cwd(), "drizzle");
    const run = async (file: string) => {
      const text = await readFile(path.join(dir, file), "utf8");
      for (const statement of text.split("--> statement-breakpoint")) await pg.exec(statement);
    };
    await run("0000_chunky_magus.sql");
    await pg.exec(`
      insert into medication_periods (drug_name, role, dose_amount, dose_unit, schedule, start_date, end_date, created_at, updated_at)
      values ('Phenobarbital', 'maintenance', 60.000, 'mg', 'twice daily', '2026-01-10', '2026-03-01', now(), now()),
             ('Phenobarbital', 'maintenance', 1.005, 'mg', 'three times daily', '2026-03-01', null, now(), now())`);
    for (const file of ["0001_medication_doses.sql", "0002_backfill_medication_doses.sql", "0003_drop_single_dose.sql"]) await run(file);

    const periods = await listMedicationHistory(drizzle(pg, { schema }) as unknown as Db);
    expect(periods.map((period) => [period.doses, period.doseUnit, period.startDate])).toEqual([
      [[{ amount: 60, when: "twice daily" }], "mg", "2026-01-10"],
      [[{ amount: 1.005, when: "three times daily" }], "mg", "2026-03-01"],
    ]);
    await expect(pg.exec(`update medication_periods set doses = '[]'`)).rejects.toThrow();
  });
});
