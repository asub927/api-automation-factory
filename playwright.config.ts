import { defineConfig } from "@playwright/test";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { assertEgressAllowed, loadEgressAllowlist } from "./src/inventory/manifest.js";

/**
 * Auto-discover per-service Playwright projects from generated/<service>/tests.
 * Lane separation uses filename patterns (*.http.spec.ts / *.mcp.spec.ts).
 */
function baseUrlFor(service: string): string | undefined {
  const envKey = `${service.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BASE_URL`;
  let baseURL: string | undefined;
  if (process.env[envKey]) baseURL = process.env[envKey];
  else if (service === "demo") {
    baseURL = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4099";
  } else {
    const manifestPath = join(process.cwd(), "contracts", service, "service.manifest.yaml");
    if (existsSync(manifestPath)) {
      const doc = YAML.parse(readFileSync(manifestPath, "utf8")) as { baseUrl?: string };
      baseURL = doc.baseUrl;
    }
  }
  if (baseURL) {
    assertEgressAllowed(baseURL, loadEgressAllowlist(process.cwd()), {
      allowHttpLocalhost: true,
    });
  }
  return baseURL;
}

function discoverProjects() {
  const generatedRoot = join(process.cwd(), "generated");
  const projects: Array<{
    name: string;
    testDir: string;
    testMatch: string | RegExp;
    use?: { baseURL?: string };
  }> = [];

  if (!existsSync(generatedRoot)) {
    return projects;
  }

  for (const service of readdirSync(generatedRoot, { withFileTypes: true })) {
    if (!service.isDirectory()) continue;
    const testDir = join(generatedRoot, service.name, "tests");
    if (!existsSync(testDir)) continue;
    const baseURL = baseUrlFor(service.name);
    for (const lane of [
      { name: "http", match: /.*\.http\.spec\.ts/ },
      { name: "mcp", match: /.*\.mcp\.spec\.ts/ },
    ] as const) {
      projects.push({
        name: `${service.name}-${lane.name}`,
        testDir,
        testMatch: lane.match,
        ...(baseURL ? { use: { baseURL } } : {}),
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
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4099",
  },
  projects: discoverProjects(),
});
