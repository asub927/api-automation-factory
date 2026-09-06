import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "templates",
  "playwright.config.ts",
);

export const PLAYWRIGHT_CONFIG_MERGE_HINT =
  "Existing playwright/playwright.config.ts was left unchanged. Ensure it discovers api/*/tests with *.http.spec.ts and *.mcp.spec.ts (or merge with the factory template).";

export type WritePlaywrightConfigResult = {
  path: string;
  written: boolean;
  mergeHint?: string;
};

/**
 * Write the workspace Playwright config template only when missing (U7 / AE4).
 * Never overwrites a custom config — returns merge guidance instead.
 */
export function writePlaywrightConfigIfMissing(playwrightRoot: string): WritePlaywrightConfigResult {
  const dest = join(playwrightRoot, "playwright.config.ts");
  if (existsSync(dest)) {
    return { path: dest, written: false, mergeHint: PLAYWRIGHT_CONFIG_MERGE_HINT };
  }
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  writeFileSync(dest, template, "utf8");
  return { path: dest, written: true };
}
