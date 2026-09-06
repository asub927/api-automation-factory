import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensurePlaywrightWorkspace } from "../../../src/scaffold/ensurePlaywrightWorkspace.js";
import { validatePlaywrightWorkspace } from "../../../src/scaffold/validate.js";
import { SetupError } from "../../../src/inventory/manifest.js";

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "ws-app-"));
}

describe("ensurePlaywrightWorkspace (U4)", () => {
  it("scaffolds empty repo into valid playwright ui+api workspaces without UI tests (AE14)", () => {
    const root = tempWorkspace();
    try {
      const result = ensurePlaywrightWorkspace(root, "demo");
      expect(result.created.length).toBeGreaterThan(0);
      expect(existsSync(join(root, "playwright/package.json"))).toBe(true);
      expect(existsSync(join(root, "playwright/api/package.json"))).toBe(true);
      expect(existsSync(join(root, "playwright/ui/package.json"))).toBe(true);
      expect(existsSync(join(root, "playwright/api/demo"))).toBe(true);

      const rootPkg = JSON.parse(readFileSync(join(root, "playwright/package.json"), "utf8")) as {
        workspaces: string[];
        devDependencies: Record<string, string>;
      };
      expect(rootPkg.workspaces).toEqual(expect.arrayContaining(["ui", "api"]));
      expect(rootPkg.devDependencies["@playwright/test"]).toBeTruthy();

      // No UI test files authored by factory
      expect(existsSync(join(root, "playwright/ui/tests"))).toBe(false);
      expect(existsSync(join(root, "playwright/ui/src"))).toBe(false);

      expect(() => validatePlaywrightWorkspace(root, "demo")).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is a no-op on an already-valid workspace and preserves UI content", () => {
    const root = tempWorkspace();
    try {
      ensurePlaywrightWorkspace(root, "demo");
      const uiSpec = join(root, "playwright/ui/login.spec.ts");
      writeFileSync(uiSpec, "import { test } from '@playwright/test';\ntest('login', async () => {});\n");
      const beforeUi = readFileSync(uiSpec, "utf8");
      const beforeRoot = readFileSync(join(root, "playwright/package.json"), "utf8");

      const second = ensurePlaywrightWorkspace(root, "demo");
      expect(second.created).toEqual([]);
      expect(readFileSync(uiSpec, "utf8")).toBe(beforeUi);
      expect(readFileSync(join(root, "playwright/package.json"), "utf8")).toBe(beforeRoot);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails validation with setup-class error on broken workspace package.json (AE15)", () => {
    const root = tempWorkspace();
    try {
      mkdirSync(join(root, "playwright/api/demo"), { recursive: true });
      mkdirSync(join(root, "playwright/ui"), { recursive: true });
      writeFileSync(join(root, "playwright/package.json"), "{ not-json ");
      expect(() => validatePlaywrightWorkspace(root, "demo")).toThrow(SetupError);
      expect(() => validatePlaywrightWorkspace(root, "demo")).toThrow(/invalid package\.json/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when workspaces omit api/ui even if package.json parses", () => {
    const root = tempWorkspace();
    try {
      mkdirSync(join(root, "playwright/api/billing"), { recursive: true });
      mkdirSync(join(root, "playwright/ui"), { recursive: true });
      writeFileSync(
        join(root, "playwright/package.json"),
        JSON.stringify({
          name: "broken",
          private: true,
          workspaces: ["other"],
          devDependencies: { "@playwright/test": "1.51.0" },
        }),
      );
      writeFileSync(join(root, "playwright/api/package.json"), JSON.stringify({ name: "api" }));
      writeFileSync(join(root, "playwright/ui/package.json"), JSON.stringify({ name: "ui" }));
      expect(() => validatePlaywrightWorkspace(root, "billing")).toThrow(/workspaces must include/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
