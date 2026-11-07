import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { listDoseTimes, setDoseTime } from "./doseTimes";

const DAY = "2026-11-05";

describe("dose times", () => {
  it("records a moved slot for that day only", async () => {
    const db = await createTestDb();
    expect((await setDoseTime(db, DAY, 360, 400)).ok).toBe(true);
    expect(await listDoseTimes(db, DAY)).toEqual(new Map([[360, 400]]));
    expect(await listDoseTimes(db, "2026-11-06")).toEqual(new Map());
  });

  it("replaces an earlier time for the same slot", async () => {
    const db = await createTestDb();
    await setDoseTime(db, DAY, 1080, 1100);
    await setDoseTime(db, DAY, 1080, 1140);
    expect(await listDoseTimes(db, DAY)).toEqual(new Map([[1080, 1140]]));
  });

  it("clears the record when set back to the usual time", async () => {
    const db = await createTestDb();
    await setDoseTime(db, DAY, 360, 400);
    expect((await setDoseTime(db, DAY, 360, 360)).ok).toBe(true);
    expect(await listDoseTimes(db, DAY)).toEqual(new Map());
  });

  it("refuses a bad time or day without saving", async () => {
    const db = await createTestDb();
    const badTime = await setDoseTime(db, DAY, 360, Number.NaN);
    expect(badTime).toMatchObject({ ok: false, error: "invalid", fieldErrors: { givenTime: "Enter a time" } });
    expect((await setDoseTime(db, DAY, 360, 1440)).ok).toBe(false);
    expect((await setDoseTime(db, "2026-02-30", 360, 400)).ok).toBe(false);
    expect((await setDoseTime(db, DAY, -1, 400)).ok).toBe(false);
    expect(await listDoseTimes(db, DAY)).toEqual(new Map());
  });
});
