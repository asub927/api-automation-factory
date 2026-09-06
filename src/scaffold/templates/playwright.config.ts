/**
 * Workspace Playwright config template.
 * Copied to playwright/playwright.config.ts when missing (U7).
 * Discovers api/<serviceId>/tests with *.http.spec.ts and *.mcp.spec.ts lanes.
 */
import { defineConfig } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const playwrightRoot = dirname(fileURLToPath(import.meta.url));

function discoverProjects() {
  const apiRoot = join(playwrightRoot, "api");
  const projects: Array<{
    name: string;
    testDir: string;
    testMatch: RegExp;
  }> = [];
  if (!existsSync(apiRoot)) return projects;

  for (const entry of readdirSync(apiRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "support" || entry.name === "node_modules") continue;
    const testDir = join(apiRoot, entry.name, "tests");
    if (!existsSync(testDir)) continue;
    for (const lane of [
      { name: "http", match: /.*\.http\.spec\.ts$/ },
      { name: "mcp", match: /.*\.mcp\.spec\.ts$/ },
    ] as const) {
      projects.push({
        name: `${entry.name}-${lane.name}`,
        testDir,
        testMatch: lane.match,
      });
    }
  }
  return projects;
}

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: discoverProjects(),
});
