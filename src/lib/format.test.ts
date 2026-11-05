import { describe, expect, it } from "vitest";
import { formatMinuteOfDay } from "./format";

describe("formatMinuteOfDay", () => {
  it("formats minutes after midnight as a clock time", () => {
    expect(formatMinuteOfDay(0)).toBe("12:00 AM");
    expect(formatMinuteOfDay(360)).toBe("6:00 AM");
    expect(formatMinuteOfDay(1439)).toBe("11:59 PM");
  });

  it("treats 1440 as the closing midnight", () => {
    expect(formatMinuteOfDay(1440)).toBe("12:00 AM");
  });

  it("drops the minutes on the hour when short", () => {
    expect(formatMinuteOfDay(360, true)).toBe("6 AM");
    expect(formatMinuteOfDay(1440, true)).toBe("12 AM");
    expect(formatMinuteOfDay(870, true)).toBe("2:30 PM");
  });
});
