import { defineConfig } from "@playwright/test";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

/**
 * Auto-discover per-service Playwright projects from generated/<service>/{http,mcp}.
 * Propose bot need not edit this file when onboarding services (KTD9 path filter).
 */
function baseUrlFor(service: string): string | undefined {
  const envKey = `${service.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BASE_URL`;
  if (process.env[envKey]) return process.env[envKey];
  if (service === "demo") return process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4099";
  const manifestPath = join(process.cwd(), "contracts", service, "service.manifest.yaml");
  if (existsSync(manifestPath)) {
    const doc = YAML.parse(readFileSync(manifestPath, "utf8")) as { baseUrl?: string };
    return doc.baseUrl;
  }
  return undefined;
}

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
    const baseURL = baseUrlFor(service.name);
    for (const lane of ["http", "mcp"] as const) {
      const testDir = join(generatedRoot, service.name, lane);
      if (!existsSync(testDir)) continue;
      projects.push({
        name: `${service.name}-${lane}`,
        testDir,
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
