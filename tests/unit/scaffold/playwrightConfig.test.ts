import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverApiLaneProjects } from "../../../src/scaffold/discoverApiProjects.js";
import {
  writePlaywrightConfigIfMissing,
  PLAYWRIGHT_CONFIG_MERGE_HINT,
} from "../../../src/scaffold/writePlaywrightConfig.js";
import { ensurePlaywrightWorkspace } from "../../../src/scaffold/ensurePlaywrightWorkspace.js";

describe("workspace Playwright config template (U7)", () => {
  it("discovers both http and mcp lane patterns for a service", () => {
    const root = mkdtempSync(join(tmpdir(), "pw-discover-"));
    try {
      const playwrightRoot = join(root, "playwright");
      const testsDir = join(playwrightRoot, "api/billing/tests");
      mkdirSync(testsDir, { recursive: true });
      mkdirSync(join(playwrightRoot, "api/support"), { recursive: true });
      writeFileSync(join(testsDir, "getInvoice.http.spec.ts"), "// http\n");
      writeFileSync(join(testsDir, "getInvoice.mcp.spec.ts"), "// mcp\n");
      writeFileSync(join(playwrightRoot, "api/support/auth.ts"), "// kit\n");

      const projects = discoverApiLaneProjects(playwrightRoot);
      expect(projects.map((p) => p.name).sort()).toEqual(["billing-http", "billing-mcp"]);
      expect(projects.every((p) => p.testDir === testsDir)).toBe(true);
      expect(projects.find((p) => p.name === "billing-http")?.testMatch.test("getInvoice.http.spec.ts")).toBe(
        true,
      );
      expect(projects.find((p) => p.name === "billing-mcp")?.testMatch.test("getInvoice.mcp.spec.ts")).toBe(
        true,
      );
      expect(projects.some((p) => p.name.startsWith("support-"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes config when missing and does not overwrite a custom config", () => {
    const root = mkdtempSync(join(tmpdir(), "pw-config-"));
    try {
      const playwrightRoot = join(root, "playwright");
      mkdirSync(playwrightRoot, { recursive: true });

      const first = writePlaywrightConfigIfMissing(playwrightRoot);
      expect(first.written).toBe(true);
      expect(existsSync(first.path)).toBe(true);
      const body = readFileSync(first.path, "utf8");
      expect(body).toContain("api");
      expect(body).toContain(".http.spec.ts");
      expect(body).toContain(".mcp.spec.ts");

      writeFileSync(first.path, "// custom config\nexport default {};\n", "utf8");
      const second = writePlaywrightConfigIfMissing(playwrightRoot);
      expect(second.written).toBe(false);
      expect(second.mergeHint).toBe(PLAYWRIGHT_CONFIG_MERGE_HINT);
      expect(readFileSync(first.path, "utf8")).toContain("custom config");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("ensurePlaywrightWorkspace installs config on empty workspace", () => {
    const root = mkdtempSync(join(tmpdir(), "pw-ensure-config-"));
    try {
      const result = ensurePlaywrightWorkspace(root, "demo");
      expect(result.playwrightConfig.written).toBe(true);
      expect(result.created).toContain("playwright/playwright.config.ts");
      expect(existsSync(join(root, "playwright/playwright.config.ts"))).toBe(true);

      const again = ensurePlaywrightWorkspace(root, "demo");
      expect(again.playwrightConfig.written).toBe(false);
      expect(again.playwrightConfig.mergeHint).toBe(PLAYWRIGHT_CONFIG_MERGE_HINT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
