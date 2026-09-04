import { describe, expect, it } from "vitest";
import { classifyError } from "../../../src/report/failureClass.js";
import { AuthError } from "../../../src/auth/loadProfile.js";
import { SetupError } from "../../../src/inventory/manifest.js";

describe("failureClass", () => {
  it("classifies AuthError as auth", () => {
    expect(classifyError(new AuthError("missing"))).toBe("auth");
  });

  it("classifies SetupError as setup", () => {
    expect(classifyError(new SetupError("bad"))).toBe("setup");
  });

  it("classifies connection errors as transport", () => {
    expect(classifyError(new Error("ECONNREFUSED 127.0.0.1"))).toBe("transport");
  });
});
