import { describe, expect, it } from "vitest";
import { medianLatencyMs } from "./statsShared.js";

describe("medianLatencyMs", () => {
  it("returns null when there are no usable samples", () => {
    expect(medianLatencyMs([])).toBeNull();
    expect(medianLatencyMs([null, undefined, -5, NaN])).toBeNull();
  });

  it("returns the middle sample for an odd-sized set", () => {
    expect(medianLatencyMs([300, 500, 400])).toBe(400);
    expect(medianLatencyMs([100, 200, 300, 400, 900])).toBe(300);
  });

  it("averages the two middle samples for an even-sized set", () => {
    expect(medianLatencyMs([100, 300])).toBe(200);
    expect(medianLatencyMs([100, 200, 300, 400])).toBe(250);
  });

  it("ignores null and negative measurements", () => {
    expect(medianLatencyMs([null, 100, 300, 200])).toBe(200);
    expect(medianLatencyMs([-1, -40, 100, 200, 300])).toBe(200);
  });

  it("rounds fractional samples before taking the median", () => {
    expect(medianLatencyMs([100.4, 300.6])).toBe(201);
  });
});
