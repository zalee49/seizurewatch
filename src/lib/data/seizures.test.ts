import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { seizureResponses, seizures } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { CONFLICT_MESSAGE } from "./result";
import {
  addResponse,
  createSeizure,
  deleteResponse,
  deleteSeizure,
  getActiveSeizure,
  getLastSeizure,
  getSeizure,
  listSeizuresBetween,
  stopSeizure,
  updateSeizure,
} from "./seizures";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function newId() {
  return crypto.randomUUID();
}

async function start(db: Db, startedAt: Date, id = newId()) {
  const result = await createSeizure(db, { id, startedAt });
  if (!result.ok) throw new Error(`createSeizure failed: ${result.message}`);
  return result.value;
}

describe("createSeizure", () => {
  it("creates one row when called twice with the same id and returns the stored one", async () => {
    const db = await createTestDb();
    const id = newId();
    const first = new Date(Date.now() - MINUTE);
    const one = await start(db, first, id);
    const two = await start(db, new Date(), id);
    expect(await db.select().from(seizures)).toHaveLength(1);
    expect(two.startedAt).toEqual(first);
    expect(two.updatedAt).toEqual(one.updatedAt);
  });

  it("refuses a malformed id", async () => {
    const db = await createTestDb();
    const result = await createSeizure(db, { id: "not-a-uuid", startedAt: new Date() });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(await db.select().from(seizures)).toEqual([]);
  });

  it("refuses an invalid start time", async () => {
    const db = await createTestDb();
    const result = await createSeizure(db, { id: newId(), startedAt: new Date("nope") });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect(await db.select().from(seizures)).toEqual([]);
  });

  it("allows a start up to 5 minutes ahead and refuses more", async () => {
    const db = await createTestDb();
    const ok = await createSeizure(db, { id: newId(), startedAt: new Date(Date.now() + 4 * MINUTE) });
    expect(ok.ok).toBe(true);
    const tooFar = await createSeizure(db, { id: newId(), startedAt: new Date(Date.now() + 6 * MINUTE) });
    expect(tooFar).toMatchObject({ ok: false, error: "invalid" });
    if (!tooFar.ok) expect(tooFar.message).toContain("Nothing was saved");
    expect(await db.select().from(seizures)).toHaveLength(1);
  });
});

describe("updateSeizure", () => {
  it("saves details, stores blanks as null and changes updatedAt", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 10 * MINUTE));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, {
      seizureType: "focal",
      severity: "mild",
      notes: "  quiet  ",
      beforeSymptoms: "  ",
      recoveryMinutes: 15,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      seizureType: "focal",
      severity: "mild",
      notes: "quiet",
      beforeSymptoms: null,
      afterSymptoms: null,
      triggers: null,
      recoveryMinutes: 15,
      endedAt: null,
    });
    expect(result.value.updatedAt.getTime()).toBeGreaterThan(seizure.updatedAt.getTime());
  });

  it("returns conflict for a stale expectedUpdatedAt and leaves the row unchanged", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 10 * MINUTE));
    const stale = new Date(seizure.updatedAt.getTime() - 1000);
    const result = await updateSeizure(db, seizure.id, stale, { notes: "mine", severity: "severe" });
    expect(result).toMatchObject({ ok: false, error: "conflict" });
    if (!result.ok) {
      expect(result.message).toContain(CONFLICT_MESSAGE);
      expect(result.message).toContain("Nothing was saved");
    }
    expect(await getSeizure(db, seizure.id)).toEqual(seizure);
  });

  it("lets only one of two saves from the same form version win", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 10 * MINUTE));
    const [a, b] = await Promise.all([
      updateSeizure(db, seizure.id, seizure.updatedAt, { notes: "a" }),
      updateSeizure(db, seizure.id, seizure.updatedAt, { notes: "b" }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    expect(loser).toMatchObject({ ok: false, error: "conflict" });
    const stored = await getSeizure(db, seizure.id);
    expect(stored?.notes).toBe(a.ok ? "a" : "b");
  });

  it("refuses an endedAt before startedAt", async () => {
    const db = await createTestDb();
    const startedAt = new Date(Date.now() - HOUR);
    const seizure = await start(db, startedAt);
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, {
      endedAt: new Date(startedAt.getTime() - MINUTE),
      notes: "x",
    });
    expect(result).toMatchObject({ ok: false, error: "invalid", fieldErrors: { endedAt: expect.any(String) } });
    expect(await getSeizure(db, seizure.id)).toEqual(seizure);
  });

  it("refuses an endedAt equal to startedAt", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, { endedAt: seizure.startedAt });
    expect(result).toMatchObject({ ok: false, error: "invalid" });
  });

  it("refuses a duration over 2 hours and writes nothing", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 5 * HOUR));
    const over = await updateSeizure(db, seizure.id, seizure.updatedAt, { durationSeconds: 2 * 3600 + 1 });
    expect(over).toMatchObject({ ok: false, error: "invalid", fieldErrors: { durationSeconds: expect.any(String) } });
    const endedAt = new Date(seizure.startedAt.getTime() + 2 * 3600 * 1000 + 1000);
    const overEnd = await updateSeizure(db, seizure.id, seizure.updatedAt, { endedAt });
    expect(overEnd).toMatchObject({ ok: false, error: "invalid" });
    expect(await getSeizure(db, seizure.id)).toEqual(seizure);
  });

  it("stops an unstopped seizure when a duration is entered", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, { durationSeconds: 105 });
    expect(result.ok && result.value.endedAt).toEqual(new Date(seizure.startedAt.getTime() + 105 * 1000));
  });

  it("lets endedAt win when both endedAt and a duration are sent", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const endedAt = new Date(seizure.startedAt.getTime() + 60 * 1000);
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, { endedAt, durationSeconds: 300 });
    expect(result.ok && result.value.endedAt).toEqual(endedAt);
  });

  it("leaves an unstopped seizure unstopped when the duration is blank", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, { durationSeconds: null });
    expect(result.ok && result.value.endedAt).toBeNull();
  });

  it("keeps an existing stop when the duration is blank", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const stopped = await stopSeizure(db, seizure.id, new Date(seizure.startedAt.getTime() + MINUTE));
    if (!stopped.ok) throw new Error("stop failed");
    const result = await updateSeizure(db, seizure.id, stopped.value.updatedAt, { notes: "n" });
    expect(result.ok && result.value.endedAt).toEqual(stopped.value.endedAt);
  });

  it("refuses an unknown enum value, a bad number and names the field", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, {
      seizureType: "wobbly" as never,
      recoveryMinutes: Number.NaN,
    });
    expect(result).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { seizureType: expect.any(String), recoveryMinutes: expect.any(String) },
    });
    expect(await getSeizure(db, seizure.id)).toEqual(seizure);
  });

  it("returns not_found after the seizure was deleted, without resurrecting it", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    await deleteSeizure(db, seizure.id);
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, { notes: "late" });
    expect(result).toMatchObject({ ok: false, error: "not_found" });
    expect(await db.select().from(seizures)).toEqual([]);
  });
});

describe("stopSeizure", () => {
  it("keeps the first ended_at when stopped twice", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 10 * MINUTE));
    const firstEnd = new Date(seizure.startedAt.getTime() + 2 * MINUTE);
    const first = await stopSeizure(db, seizure.id, firstEnd);
    const second = await stopSeizure(db, seizure.id, new Date(seizure.startedAt.getTime() + 5 * MINUTE));
    expect(first.ok && first.value.endedAt).toEqual(firstEnd);
    expect(second.ok && second.value.endedAt).toEqual(firstEnd);
    expect((await getSeizure(db, seizure.id))?.endedAt).toEqual(firstEnd);
  });

  it("refuses a stop over 2 hours after the start and leaves ended_at null", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 5 * HOUR));
    const result = await stopSeizure(db, seizure.id, new Date(seizure.startedAt.getTime() + 2 * HOUR + 1000));
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    if (!result.ok) expect(result.message).toContain("Nothing was saved");
    expect((await getSeizure(db, seizure.id))?.endedAt).toBeNull();
  });

  it("accepts a stop exactly 2 hours after the start", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 5 * HOUR));
    const result = await stopSeizure(db, seizure.id, new Date(seizure.startedAt.getTime() + 2 * HOUR));
    expect(result.ok).toBe(true);
  });

  it("refuses a stop at or before the start", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - MINUTE));
    const result = await stopSeizure(db, seizure.id, seizure.startedAt);
    expect(result).toMatchObject({ ok: false, error: "invalid" });
  });

  it("returns not_found for an unknown id", async () => {
    const db = await createTestDb();
    expect(await stopSeizure(db, newId(), new Date())).toMatchObject({ ok: false, error: "not_found" });
  });

  it("keeps one ended_at when two stops race", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - 10 * MINUTE));
    const a = new Date(seizure.startedAt.getTime() + MINUTE);
    const b = new Date(seizure.startedAt.getTime() + 2 * MINUTE);
    const [ra, rb] = await Promise.all([stopSeizure(db, seizure.id, a), stopSeizure(db, seizure.id, b)]);
    expect(ra.ok && rb.ok).toBe(true);
    const stored = (await getSeizure(db, seizure.id))?.endedAt;
    expect(ra.ok && ra.value.endedAt).toEqual(stored);
    expect(rb.ok && rb.value.endedAt).toEqual(stored);
  });
});

describe("getActiveSeizure", () => {
  it("ignores a 3-hour-old unstopped seizure", async () => {
    const db = await createTestDb();
    const now = new Date();
    await start(db, new Date(now.getTime() - 3 * HOUR));
    expect(await getActiveSeizure(db, now)).toBeNull();
  });

  it("returns an unstopped seizure from the last 2 hours, and not a stopped one", async () => {
    const db = await createTestDb();
    const now = new Date();
    const seizure = await start(db, new Date(now.getTime() - HOUR));
    expect((await getActiveSeizure(db, now))?.id).toBe(seizure.id);
    await stopSeizure(db, seizure.id, new Date(now.getTime() - 30 * MINUTE));
    expect(await getActiveSeizure(db, now)).toBeNull();
  });
});

describe("getLastSeizure", () => {
  it("returns the most recent start, or null when there are none", async () => {
    const db = await createTestDb();
    expect(await getLastSeizure(db)).toBeNull();
    const now = Date.now();
    await start(db, new Date(now - 3 * HOUR));
    const latest = await start(db, new Date(now - HOUR));
    await start(db, new Date(now - 2 * HOUR));
    expect((await getLastSeizure(db))?.id).toBe(latest.id);
  });
});

describe("listSeizuresBetween", () => {
  it("respects [from, to) and sorts ascending", async () => {
    const db = await createTestDb();
    const from = new Date("2026-03-01T05:00:00Z");
    const to = new Date("2026-04-01T04:00:00Z");
    const atTo = await start(db, to);
    const mid = await start(db, new Date("2026-03-15T12:00:00Z"));
    const atFrom = await start(db, from);
    await start(db, new Date(from.getTime() - 1));
    const result = await listSeizuresBetween(db, from, to);
    expect(result.map((s) => s.id)).toEqual([atFrom.id, mid.id]);
    expect(result.map((s) => s.id)).not.toContain(atTo.id);
  });

  it("includes each seizure's responses", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date("2026-03-15T12:00:00Z"));
    await addResponse(db, seizure.id, { kind: "other", description: "Held him" });
    const [listed] = await listSeizuresBetween(db, new Date("2026-03-01T00:00:00Z"), new Date("2026-04-01T00:00:00Z"));
    expect(listed.responses).toHaveLength(1);
  });
});

describe("responses", () => {
  it("adds a rescue med with numeric dose as a number", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const givenAt = new Date(Date.now() - 30 * MINUTE);
    const result = await addResponse(db, seizure.id, {
      kind: "rescue_med",
      medicationName: " Midazolam ",
      doseAmount: 2.5,
      doseUnit: "mg",
      givenAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      kind: "rescue_med",
      medicationName: "Midazolam",
      doseAmount: 2.5,
      doseUnit: "mg",
      givenAt,
      description: null,
    });
    const stored = await getSeizure(db, seizure.id);
    expect(stored?.responses[0].doseAmount).toBe(2.5);
    expect(typeof stored?.responses[0].doseAmount).toBe("number");
  });

  it("needs a medication name for rescue_med and a description for other", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    expect(await addResponse(db, seizure.id, { kind: "rescue_med" })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { medicationName: expect.any(String) },
    });
    expect(await addResponse(db, seizure.id, { kind: "other" })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { description: expect.any(String) },
    });
    expect(await addResponse(db, seizure.id, { kind: "bogus" as never, description: "x" })).toMatchObject({
      ok: false,
      error: "invalid",
      fieldErrors: { kind: expect.any(String) },
    });
    expect(await addResponse(db, seizure.id, { kind: "other", description: "x", doseAmount: Number.NaN })).toMatchObject(
      { ok: false, error: "invalid", fieldErrors: { doseAmount: expect.any(String) } },
    );
    expect(await db.select().from(seizureResponses)).toEqual([]);
  });

  it("returns not_found for a response on a deleted or unknown seizure", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    await deleteSeizure(db, seizure.id);
    expect(await addResponse(db, seizure.id, { kind: "other", description: "late" })).toMatchObject({
      ok: false,
      error: "not_found",
    });
    expect(await db.select().from(seizureResponses)).toEqual([]);
  });

  it("deletes a response, and returns not_found the second time", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    const added = await addResponse(db, seizure.id, { kind: "other", description: "Cooled him down" });
    if (!added.ok) throw new Error("add failed");
    expect(await deleteResponse(db, added.value.id)).toEqual({ ok: true, value: { id: added.value.id } });
    expect(await deleteResponse(db, added.value.id)).toMatchObject({ ok: false, error: "not_found" });
    expect(await deleteResponse(db, newId())).toMatchObject({ ok: false, error: "not_found" });
  });

  it("does not change the seizure's updatedAt, so an open details form still saves", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    await addResponse(db, seizure.id, { kind: "other", description: "Stayed with him" });
    const result = await updateSeizure(db, seizure.id, seizure.updatedAt, { notes: "ok" });
    expect(result.ok).toBe(true);
  });
});

describe("deleteSeizure", () => {
  it("deletes the seizure's responses with it", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    await addResponse(db, seizure.id, { kind: "other", description: "Held him" });
    await addResponse(db, seizure.id, { kind: "rescue_med", medicationName: "Midazolam" });
    expect(await db.select().from(seizureResponses)).toHaveLength(2);
    expect(await deleteSeizure(db, seizure.id)).toEqual({ ok: true, value: { id: seizure.id } });
    expect(await db.select().from(seizures)).toEqual([]);
    expect(await db.select().from(seizureResponses)).toEqual([]);
  });

  it("returns not_found for an unknown id", async () => {
    const db = await createTestDb();
    expect(await deleteSeizure(db, newId())).toMatchObject({ ok: false, error: "not_found" });
  });
});

describe("reading rows", () => {
  it("maps an unknown stored seizure_type or severity to null instead of throwing", async () => {
    const db = await createTestDb();
    const seizure = await start(db, new Date(Date.now() - HOUR));
    // The check constraints block bad values today; simulate an older schema without them.
    await db.execute(`alter table seizures drop constraint seizures_seizure_type_check`);
    await db.execute(`alter table seizures drop constraint seizures_severity_check`);
    await db.update(seizures).set({ seizureType: "tremor", severity: "extreme" }).where(eq(seizures.id, seizure.id));
    const read = await getSeizure(db, seizure.id);
    expect(read).toMatchObject({ seizureType: null, severity: null });
    expect((await listSeizuresBetween(db, new Date(0), new Date(Date.now() + HOUR)))[0].seizureType).toBeNull();
  });

  it("returns null for an unknown or malformed id", async () => {
    const db = await createTestDb();
    expect(await getSeizure(db, newId())).toBeNull();
    expect(await getSeizure(db, "nope")).toBeNull();
  });
});
