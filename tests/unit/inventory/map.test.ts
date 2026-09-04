import { describe, expect, it } from "vitest";
import { classifyMutation } from "../../../src/inventory/map.js";

describe("mutation classification", () => {
  it("uses readOnlyHint", () => {
    expect(
      classifyMutation({ name: "weird", annotations: { readOnlyHint: true } }),
    ).toBe("read");
  });

  it("uses destructiveHint", () => {
    expect(
      classifyMutation({ name: "weird", annotations: { destructiveHint: true } }),
    ).toBe("mutating");
  });

  it("fails closed to unknown when ambiguous", () => {
    expect(classifyMutation({ name: "processThing" })).toBe("unknown");
  });
});
