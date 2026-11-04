import { describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { profile, seizures } from "./schema";

describe("schema", () => {
  it("applies the migrations to PGlite", async () => {
    const db = await createTestDb();
    expect(await db.select().from(seizures)).toEqual([]);
  });

  it("rejects a profile row with id other than 1", async () => {
    const db = await createTestDb();
    const now = new Date();
    await expect(
      db.insert(profile).values({ id: 2, createdAt: now, updatedAt: now }),
    ).rejects.toThrow();
    await expect(
      db.insert(profile).values({ id: 1, createdAt: now, updatedAt: now }),
    ).resolves.toBeDefined();
  });

  it("rejects a seizure that ends before it starts", async () => {
    const db = await createTestDb();
    const now = new Date();
    await expect(
      db.insert(seizures).values({
        id: crypto.randomUUID(),
        startedAt: new Date("2026-06-10T12:00:00Z"),
        endedAt: new Date("2026-06-10T11:59:00Z"),
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow();
  });
});
