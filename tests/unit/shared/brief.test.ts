import { describe, expect, it } from "vitest";
import { computePageCountEst } from "../../../src/shared/brief.js";

describe("computePageCountEst", () => {
  it("clamps to min 3 for very short durations", () => {
    expect(computePageCountEst(1)).toBe(3);
  });
  it("rounds 30 min to 20 pages", () => {
    expect(computePageCountEst(30)).toBe(20);
  });
  it("clamps to max 60 for very long durations", () => {
    expect(computePageCountEst(180)).toBe(60);
  });
});
