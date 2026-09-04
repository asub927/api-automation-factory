import { describe, expect, it } from "vitest";
import { loadAuthHeaders } from "../../../support/fixtures/auth.js";

describe("suite auth gate (AE6)", () => {
  it("unset DEMO_API_TOKEN yields auth-class failure, not contract", () => {
    const prev = process.env.DEMO_API_TOKEN;
    delete process.env.DEMO_API_TOKEN;
    try {
      expect(() => loadAuthHeaders("demo")).toThrow(/auth:/);
      try {
        loadAuthHeaders("demo");
      } catch (err) {
        expect(err && typeof err === "object" && "failureClass" in err).toBe(true);
        expect((err as { failureClass: string }).failureClass).toBe("auth");
        expect(String((err as Error).message)).not.toMatch(/contract/i);
      }
    } finally {
      if (prev === undefined) delete process.env.DEMO_API_TOKEN;
      else process.env.DEMO_API_TOKEN = prev;
    }
  });
});
