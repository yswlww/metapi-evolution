import { describe, expect, it, vi, afterEach } from "vitest";
import { fmtAgo, fmtTime, parseStoredUtcDateTime } from "./format";

describe("stored UTC timestamps", () => {
  afterEach(() => vi.useRealTimers());

  it("treats a timezone-less SQL datetime as UTC, not local time", () => {
    const parsed = parseStoredUtcDateTime("2026-11-17 03:00:00");
    expect(parsed?.toISOString()).toBe("2026-11-17T03:00:00.000Z");
  });

  it("shows a just-created SQL UTC alert as seconds ago in UTC+8", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T03:00:30.000Z"));
    expect(fmtAgo("2026-11-17 03:00:00")).toBe("30s ago");
  });

  it("renders SQL UTC clock time in the viewer's local zone", () => {
    expect(fmtTime("2026-11-17 03:00:00", "en-US", "Asia/Hong_Kong")).toBe("11:00");
  });
});
