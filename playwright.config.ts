import { defineConfig } from "@playwright/test";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Auto-discover per-service Playwright projects from generated/<service>/{http,mcp}.
 * Propose bot need not edit this file when onboarding services (KTD9 path filter).
 */
function discoverProjects() {
  const generatedRoot = join(process.cwd(), "generated");
  const projects: Array<{
    name: string;
    testDir: string;
    use?: { baseURL?: string };
  }> = [];

  if (!existsSync(generatedRoot)) {
    return projects;
  }

  for (const service of readdirSync(generatedRoot, { withFileTypes: true })) {
    if (!service.isDirectory()) continue;
    for (const lane of ["http", "mcp"] as const) {
      const testDir = join(generatedRoot, service.name, lane);
      if (!existsSync(testDir)) continue;
      projects.push({
        name: `${service.name}-${lane}`,
        testDir,
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
