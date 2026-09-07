import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  playwrightPaths,
  validatePlaywrightWorkspace,
  type PlaywrightWorkspacePaths,
} from "./validate.js";
import { writePlaywrightConfigIfMissing } from "./writePlaywrightConfig.js";

const PLAYWRIGHT_VERSION = "^1.51.0";

function writeJsonIfMissing(path: string, value: unknown): boolean {
  if (existsSync(path)) return false;
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return true;
}

function ensureDir(path: string): boolean {
  if (existsSync(path)) return false;
  mkdirSync(path, { recursive: true });
  return true;
}

export type EnsureScaffoldResult = {
  paths: PlaywrightWorkspacePaths;
  created: string[];
  playwrightConfig: {
    path: string;
    written: boolean;
    mergeHint?: string;
  };
};

/**
 * Ensure API-scoped Playwright npm workspace scaffolding exists under workspaceRoot.
 * Creates missing root/api/ui package stubs and the service landing directory.
 * Never authors UI tests or UI-specific dependency trees (R15 / AE14).
 */
export function ensurePlaywrightWorkspace(
  workspaceRoot: string,
  serviceId: string,
): EnsureScaffoldResult {
  const paths = playwrightPaths(workspaceRoot, serviceId);
  const created: string[] = [];

  if (ensureDir(paths.playwrightRoot)) created.push("playwright/");

  const rootPkgPath = join(paths.playwrightRoot, "package.json");
  if (!existsSync(rootPkgPath)) {
    writeJsonIfMissing(rootPkgPath, {
      name: "app-playwright",
      private: true,
      workspaces: ["ui", "api"],
      devDependencies: {
        "@playwright/test": PLAYWRIGHT_VERSION,
      },
    });
    created.push("playwright/package.json");
  } else {
    // Additive: if workspaces missing ui/api, merge them in without removing others.
    const raw = JSON.parse(readFileSync(rootPkgPath, "utf8")) as {
      workspaces?: string[] | { packages?: string[] };
      devDependencies?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    let changed = false;
    let list: string[] = [];
    if (Array.isArray(raw.workspaces)) list = [...raw.workspaces];
    else if (raw.workspaces && Array.isArray(raw.workspaces.packages)) {
      list = [...raw.workspaces.packages];
    } else {
      raw.workspaces = list;
      changed = true;
    }
    for (const name of ["ui", "api"]) {
      if (!list.includes(name) && !list.includes(`./${name}`)) {
        list.push(name);
        changed = true;
      }
    }
    if (Array.isArray(raw.workspaces)) raw.workspaces = list;
    else if (raw.workspaces) raw.workspaces.packages = list;

    raw.devDependencies ??= {};
    if (!raw.devDependencies["@playwright/test"] && !raw.dependencies?.["@playwright/test"] && !raw.devDependencies.playwright && !raw.dependencies?.playwright) {
      raw.devDependencies["@playwright/test"] = PLAYWRIGHT_VERSION;
      changed = true;
    }
    if (changed) {
      writeFileSync(rootPkgPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
      created.push("playwright/package.json (updated workspaces)");
    }
  }

  if (ensureDir(paths.apiRoot)) created.push("playwright/api/");
  if (
    writeJsonIfMissing(join(paths.apiRoot, "package.json"), {
      name: "@app/playwright-api",
      private: true,
      version: "0.0.0",
    })
  ) {
    created.push("playwright/api/package.json");
  }

  if (ensureDir(paths.uiRoot)) created.push("playwright/ui/");
  if (
    writeJsonIfMissing(join(paths.uiRoot, "package.json"), {
      name: "@app/playwright-ui",
      private: true,
      version: "0.0.0",
      description: "UI Playwright package stub — factory does not author UI tests",
    })
  ) {
    created.push("playwright/ui/package.json");
  }

  // Landing path for this service (emit writes tests/ + schemas/ here).
  if (ensureDir(paths.serviceRoot)) {
    created.push(`playwright/api/${serviceId}/`);
  }
  if (ensureDir(join(paths.serviceRoot, "tests"))) {
    created.push(`playwright/api/${serviceId}/tests/`);
  }
  if (ensureDir(join(paths.serviceRoot, "schemas"))) {
    created.push(`playwright/api/${serviceId}/schemas/`);
  }

  // Playwright config that discovers api/*/tests — only when missing (U7).
  const configResult = writePlaywrightConfigIfMissing(paths.playwrightRoot);
  if (configResult.written) {
    created.push("playwright/playwright.config.ts");
  }

  // Validate after ensure — broken existing package.json still fails (AE15).
  validatePlaywrightWorkspace(workspaceRoot, serviceId);
  return { paths, created, playwrightConfig: configResult };
}
