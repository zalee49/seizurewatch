import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { bloodDraws, bloodResults } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import type { BloodDrawInput } from "@/lib/validation/bloodwork";
import { createDraw, deleteDraw, getDraw, listDraws, listTrendSeries, updateDraw, type BloodDraw } from "./bloodwork";

const pheno = { testName: "Phenobarbital", value: 28.5, unit: "µg/mL", rangeLow: 15, rangeHigh: 45 };
const alt = { testName: "ALT", value: 120, unit: "U/L", rangeLow: 10, rangeHigh: 100 };

function draw(drawnAt: string, results: BloodDrawInput["results"], extra: Partial<BloodDrawInput> = {}): BloodDrawInput {
  return { drawnAt: new Date(drawnAt), results, ...extra };
}

function value<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(`save failed: ${result.message}`);
  return result.value;
}

async function counts(db: Db) {
  const [draws] = await db.select({ n: sql<number>`count(*)::int` }).from(bloodDraws);
  const [results] = await db.select({ n: sql<number>`count(*)::int` }).from(bloodResults);
  return { draws: draws.n, results: results.n };
}

// Test-only trigger: every result insert fails, so rollback is checked against real Postgres.
async function failResultInserts(db: Db) {
  await db.execute(sql`
    create function fail_result() returns trigger language plpgsql as $$
    begin raise exception 'test failure'; end $$
  `);
  await db.execute(sql`create trigger fail_result before insert on blood_results for each row execute function fail_result()`);
}

describe("createDraw", () => {
  it("saves a draw with its results in order, numbers as numbers", async () => {
    const db = await createTestDb();
    const saved = value(
      await createDraw(db, draw("2026-10-01T13:00:00Z", [pheno, { ...alt, rangeLow: null, rangeHigh: null }], { lab: "  IDEXX ", notes: "" })),
    );
    expect(saved).toMatchObject({ lab: "IDEXX", notes: null, drawnAt: new Date("2026-10-01T13:00:00Z") });
    expect(saved.results).toEqual([
      { ...pheno, id: expect.any(String) },
      { ...alt, rangeLow: null, rangeHigh: null, id: expect.any(String) },
    ]);
    expect(await getDraw(db, saved.id)).toEqual(saved);
  });

  it("ignores fully empty rows", async () => {
    const db = await createTestDb();
    const empty = { testName: "  ", value: null, unit: "", rangeLow: null, rangeHigh: null };
    const saved = value(await createDraw(db, draw("2026-10-01T13:00:00Z", [empty, pheno, {}])));
    expect(saved.results).toHaveLength(1);
  });

  it("refuses an invalid row by its form index and saves nothing", async () => {
    const db = await createTestDb();
    const result = await createDraw(db, draw("2026-10-01T13:00:00Z", [pheno, {}, { testName: "ALT", unit: "U/L" }]));
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      message: "Check result row 3. Nothing was saved.",
      fieldErrors: { "results.2.value": "Enter the value" },
    });
    expect(await counts(db)).toEqual({ draws: 0, results: 0 });
  });

  it("refuses a missing value, unit or name, a value that isn't a number, and a reversed range", async () => {
    const db = await createTestDb();
    const cases: [BloodDrawInput["results"][number], string][] = [
      [{ testName: "ALT", value: 5 }, "results.0.unit"],
      [{ value: 5, unit: "U/L" }, "results.0.testName"],
      [{ ...alt, value: Number("abc") }, "results.0.value"],
      [{ ...alt, value: 1.23456 }, "results.0.value"],
      [{ ...alt, rangeLow: 100, rangeHigh: 10 }, "results.0.rangeLow"],
    ];
    for (const [row, field] of cases) {
      const result = await createDraw(db, draw("2026-10-01T13:00:00Z", [row]));
      expect(result.ok ? null : result.fieldErrors?.[field]).toEqual(expect.any(String));
    }
    expect(await counts(db)).toEqual({ draws: 0, results: 0 });
  });

  it("refuses a draw with no results, a missing date, or the same test twice", async () => {
    const db = await createTestDb();
    expect(await createDraw(db, draw("2026-10-01T13:00:00Z", [{}]))).toMatchObject({
      ok: false,
      fieldErrors: { results: "Add at least one result" },
    });
    expect(await createDraw(db, { drawnAt: new Date(NaN), results: [pheno] })).toMatchObject({
      ok: false,
      fieldErrors: { drawnAt: expect.any(String) },
    });
    expect(await createDraw(db, draw("2026-10-01T13:00:00Z", [pheno, { ...pheno, testName: "phenobarbital " }]))).toMatchObject({
      ok: false,
      fieldErrors: { "results.1.testName": "This test is already in row 1" },
    });
    expect(await counts(db)).toEqual({ draws: 0, results: 0 });
  });

  it("leaves no draw behind when a result row fails to insert", async () => {
    const db = await createTestDb();
    await failResultInserts(db);
    await expect(createDraw(db, draw("2026-10-01T13:00:00Z", [pheno]))).rejects.toThrow();
    expect(await counts(db)).toEqual({ draws: 0, results: 0 });
  });
});

describe("updateDraw", () => {
  async function saved(db: Db): Promise<BloodDraw> {
    return value(await createDraw(db, draw("2026-10-01T13:00:00Z", [pheno, alt])));
  }

  it("replaces the result rows and moves the version", async () => {
    const db = await createTestDb();
    const original = await saved(db);
    const updated = value(await updateDraw(db, original.id, original.updatedAt, draw("2026-10-02T13:00:00Z", [{ ...alt, value: 90 }], { lab: "Vet" })));
    expect(updated).toMatchObject({ id: original.id, lab: "Vet", drawnAt: new Date("2026-10-02T13:00:00Z") });
    expect(updated.results.map((result) => [result.testName, result.value])).toEqual([["ALT", 90]]);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
    expect(await counts(db)).toEqual({ draws: 1, results: 1 });
  });

  it("refuses a stale version and writes nothing", async () => {
    const db = await createTestDb();
    const original = await saved(db);
    const later = new Date(original.updatedAt.getTime() + 1000);
    await db.update(bloodDraws).set({ updatedAt: later });
    const result = await updateDraw(db, original.id, original.updatedAt, draw("2026-10-02T13:00:00Z", [alt]));
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect((await getDraw(db, original.id))?.results).toHaveLength(2);
  });

  it("keeps the old results when the new rows fail to insert", async () => {
    const db = await createTestDb();
    const original = await saved(db);
    await failResultInserts(db);
    await expect(updateDraw(db, original.id, original.updatedAt, draw("2026-10-02T13:00:00Z", [alt]))).rejects.toThrow();
    expect(await getDraw(db, original.id)).toEqual(original);
  });

  it("refuses an invalid row before anything else, and a missing draw as not found", async () => {
    const db = await createTestDb();
    const original = await saved(db);
    expect(await updateDraw(db, original.id, original.updatedAt, draw("2026-10-02T13:00:00Z", [{ testName: "ALT" }]))).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(await getDraw(db, original.id)).toEqual(original);
    expect(
      await updateDraw(db, "00000000-0000-0000-0000-000000000000", original.updatedAt, draw("2026-10-02T13:00:00Z", [alt])),
    ).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("deleteDraw and listDraws", () => {
  it("lists newest first and deletes a draw with its results", async () => {
    const db = await createTestDb();
    const older = value(await createDraw(db, draw("2026-09-01T13:00:00Z", [pheno])));
    const newer = value(await createDraw(db, draw("2026-10-01T13:00:00Z", [pheno, alt])));
    expect((await listDraws(db)).map((d) => d.id)).toEqual([newer.id, older.id]);
    expect(await deleteDraw(db, newer.id)).toEqual({ ok: true, value: { id: newer.id } });
    expect(await deleteDraw(db, newer.id)).toMatchObject({ ok: false, error: "not_found" });
    expect(await counts(db)).toEqual({ draws: 1, results: 1 });
  });
});

describe("listTrendSeries", () => {
  it("joins names differing in case and spacing, splits units, and skips tests seen once", async () => {
    const db = await createTestDb();
    await createDraw(db, draw("2026-09-01T13:00:00Z", [{ ...pheno, testName: "Phenobarbital ", value: 22 }, alt]));
    await createDraw(db, draw("2026-10-01T13:00:00Z", [{ ...pheno, testName: "phenobarbital", rangeLow: 20 }]));
    await createDraw(db, draw("2026-08-01T13:00:00Z", [{ ...pheno, value: 2.1, unit: "mg/dL" }]));
    await createDraw(db, draw("2026-11-01T13:00:00Z", [{ ...pheno, value: 3.0, unit: "mg/dL" }]));

    const series = await listTrendSeries(db);
    expect(series.map((s) => s.key)).toEqual(["phenobarbital|mg/dl", "phenobarbital|µg/ml"]);
    const micro = series[1];
    expect(micro).toMatchObject({ testName: "phenobarbital", unit: "µg/mL" });
    expect(micro.points.map((point) => [point.drawnAt.toISOString().slice(0, 10), point.value, point.rangeLow])).toEqual([
      ["2026-09-01", 22, 15],
      ["2026-10-01", 28.5, 20],
    ]);
  });

  it("returns nothing with no repeated test", async () => {
    const db = await createTestDb();
    await createDraw(db, draw("2026-09-01T13:00:00Z", [pheno]));
    expect(await listTrendSeries(db)).toEqual([]);
  });
});
