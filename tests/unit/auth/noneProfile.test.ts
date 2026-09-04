import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile, headersFromProfile } from "../../../src/auth/loadProfile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("none auth profile", () => {
  it("loads jsonplaceholder profile with empty headers", () => {
    const profile = loadProfile(join(root, "support/profiles/jsonplaceholder.yaml"));
    expect(profile.type).toBe("none");
    expect(headersFromProfile(profile)).toEqual({});
  });
});
