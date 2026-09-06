import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type ApiLaneProject = {
  name: string;
  testDir: string;
  testMatch: RegExp;
};

/**
 * Discover HTTP + MCP Playwright projects under playwright/api/<service>/tests.
 * Skips the shared support/ package directory.
 */
export function discoverApiLaneProjects(playwrightRoot: string): ApiLaneProject[] {
  const apiRoot = join(playwrightRoot, "api");
  const projects: ApiLaneProject[] = [];
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
