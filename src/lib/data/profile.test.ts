import { describe, expect, it, vi } from "vitest";
import { profile } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { getProfile, saveProfile } from "./profile";

describe("saveProfile", () => {
  it("advances the version even when the clock has not moved", async () => {
    const db = await createTestDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
    try {
      const first = await saveProfile(db, null, { name: "First" });
      if (!first.ok) throw new Error(first.message);
      const second = await saveProfile(db, first.value.updatedAt, { name: "Second" });
      if (!second.ok) throw new Error(second.message);
      expect(second.value.updatedAt.getTime()).toBeGreaterThan(first.value.updatedAt.getTime());
      expect(await saveProfile(db, first.value.updatedAt, { name: "Stale" })).toMatchObject({ ok: false, error: "conflict" });
      expect(await getProfile(db)).toEqual(second.value);
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no profile until the first save", async () => {
    const db = await createTestDb();
    expect(await getProfile(db)).toBeNull();
  });

  it("creates the row on the first save", async () => {
    const db = await createTestDb();
    const result = await saveProfile(db, null, {
      name: " Biscuit ",
      weightAmount: 62.5,
      weightUnit: "lb",
      birthday: "2019-03-02",
    });
    expect(result.ok).toBe(true);
    const stored = await getProfile(db);
    expect(stored).toMatchObject({ name: "Biscuit", weightAmount: 62.5, weightUnit: "lb", birthday: "2019-03-02" });
    expect(await db.select().from(profile)).toHaveLength(1);
  });

  it("refuses a second first save and keeps the first one's values", async () => {
    const db = await createTestDb();
    await saveProfile(db, null, { name: "First" });
    const second = await saveProfile(db, null, { name: "Second" });
    expect(second).toMatchObject({ ok: false, error: "conflict" });
    expect((await getProfile(db))?.name).toBe("First");
    expect(await db.select().from(profile)).toHaveLength(1);
  });

  it("refuses a stale updatedAt and writes nothing", async () => {
    const db = await createTestDb();
    await saveProfile(db, null, { name: "First" });
    const stale = new Date(Date.now() - 60_000);
    const result = await saveProfile(db, stale, { name: "Stale" });
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    expect((await getProfile(db))?.name).toBe("First");
  });

  it("refuses an invalid expectedUpdatedAt", async () => {
    const db = await createTestDb();
    await saveProfile(db, null, { name: "First" });
    expect(await saveProfile(db, new Date("nope"), { name: "X" })).toMatchObject({ ok: false, error: "conflict" });
  });

  it("refuses an update when no profile exists", async () => {
    const db = await createTestDb();
    expect(await saveProfile(db, new Date(), { name: "X" })).toMatchObject({ ok: false, error: "conflict" });
    expect(await getProfile(db)).toBeNull();
  });

  it("saves with the current updatedAt, then refuses the old one", async () => {
    const db = await createTestDb();
    const first = await saveProfile(db, null, { name: "First" });
    if (!first.ok) throw new Error(first.message);
    // Versions are millisecond timestamps: let the clock move so the second save gets a new one.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await saveProfile(db, first.value.updatedAt, { name: "Second", breed: "Lab" });
    if (!second.ok) throw new Error(second.message);
    expect(second.value).toMatchObject({ name: "Second", breed: "Lab" });
    expect(second.value.updatedAt.getTime()).toBeGreaterThan(first.value.updatedAt.getTime());
    const third = await saveProfile(db, first.value.updatedAt, { name: "Third" });
    expect(third).toMatchObject({ ok: false, error: "conflict" });
    expect((await getProfile(db))?.name).toBe("Second");
  });

  it("refuses an impossible birthday with a field error", async () => {
    const db = await createTestDb();
    const result = await saveProfile(db, null, { birthday: "2026-02-30" });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    if (!result.ok) expect(result.fieldErrors?.birthday).toBeTruthy();
    expect(await getProfile(db)).toBeNull();
  });

  it("refuses a weight with 3 decimals or no unit", async () => {
    const db = await createTestDb();
    const decimals = await saveProfile(db, null, { weightAmount: 62.125, weightUnit: "lb" });
    expect(decimals).toMatchObject({ ok: false, error: "invalid" });
    if (!decimals.ok) expect(decimals.fieldErrors?.weightAmount).toBeTruthy();
    const noUnit = await saveProfile(db, null, { weightAmount: 62 });
    expect(noUnit).toMatchObject({ ok: false, error: "invalid" });
    if (!noUnit.ok) expect(noUnit.fieldErrors?.weightUnit).toBe("Choose lb or kg");
    expect(await getProfile(db)).toBeNull();
  });

  it("stores a unit with no amount as no weight", async () => {
    const db = await createTestDb();
    const result = await saveProfile(db, null, { weightUnit: "kg" });
    expect(result.ok && result.value).toMatchObject({ weightAmount: null, weightUnit: null });
  });

  it("stores blank text as null", async () => {
    const db = await createTestDb();
    const result = await saveProfile(db, null, { name: "   ", vetPhone: "", notes: "\n", birthday: null });
    expect(result.ok && result.value).toMatchObject({ name: null, vetPhone: null, notes: null, birthday: null });
  });
});
