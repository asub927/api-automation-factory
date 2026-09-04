import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile, headersFromProfile, AuthError } from "../../../src/auth/loadProfile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("loadProfile", () => {
  it("fails auth-class when required secret missing (AE6)", () => {
    const profile = loadProfile(join(root, "support/profiles/demo.yaml"));
    expect(() => headersFromProfile(profile, {})).toThrow(AuthError);
  });

  it("resolves bearer header when env present", () => {
    const profile = loadProfile(join(root, "support/profiles/demo.yaml"));
    const headers = headersFromProfile(profile, { DEMO_API_TOKEN: "test-token" });
    expect(headers.Authorization).toBe("Bearer test-token");
  });
});
