import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SetupError } from "../inventory/manifest.js";

export type PlaywrightWorkspacePaths = {
  playwrightRoot: string;
  apiRoot: string;
  uiRoot: string;
  serviceRoot: string;
};

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (err) {
    throw new SetupError(
      `invalid package.json at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SetupError(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function workspaceEntries(pkg: Record<string, unknown>): string[] {
  const workspaces = pkg.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.map(String);
  }
  if (workspaces && typeof workspaces === "object" && !Array.isArray(workspaces)) {
    const nested = (workspaces as { packages?: unknown }).packages;
    if (Array.isArray(nested)) return nested.map(String);
  }
  throw new SetupError("playwright/package.json must declare workspaces including ui and api");
}

function hasWorkspace(entries: string[], name: string): boolean {
  const patterns = new Set([name, `./${name}`, `${name}/*`, `./${name}/*`]);
  return entries.some((e) => patterns.has(e));
}

/** Resolve standard playwright workspace paths under an app checkout root. */
export function playwrightPaths(workspaceRoot: string, serviceId: string): PlaywrightWorkspacePaths {
  const playwrightRoot = join(workspaceRoot, "playwright");
  return {
    playwrightRoot,
    apiRoot: join(playwrightRoot, "api"),
    uiRoot: join(playwrightRoot, "ui"),
    serviceRoot: join(playwrightRoot, "api", serviceId),
  };
}

/**
 * Validate Playwright npm workspace shape required before propose (R15 / F8 / AE15).
 * Does not require generated suite files — only scaffolding wiring + landing dirs.
 */
export function validatePlaywrightWorkspace(
  workspaceRoot: string,
  serviceId: string,
): PlaywrightWorkspacePaths {
  if (!serviceId || serviceId.includes("/") || serviceId.includes("..")) {
    throw new SetupError(`invalid serviceId for workspace landing: ${serviceId}`);
  }

  const paths = playwrightPaths(workspaceRoot, serviceId);

  if (!existsSync(paths.playwrightRoot) || !statSync(paths.playwrightRoot).isDirectory()) {
    throw new SetupError("missing playwright/ directory in workspace checkout");
  }

  const rootPkgPath = join(paths.playwrightRoot, "package.json");
  if (!existsSync(rootPkgPath)) {
    throw new SetupError("missing playwright/package.json");
  }

  const rootPkg = asRecord(readJson(rootPkgPath), "playwright/package.json");
  const entries = workspaceEntries(rootPkg);
  if (!hasWorkspace(entries, "api") || !hasWorkspace(entries, "ui")) {
    throw new SetupError(
      `playwright workspaces must include ui and api (found: ${entries.join(", ") || "(empty)"})`,
    );
  }

  const deps = {
    ...(typeof rootPkg.dependencies === "object" && rootPkg.dependencies
      ? (rootPkg.dependencies as Record<string, unknown>)
      : {}),
    ...(typeof rootPkg.devDependencies === "object" && rootPkg.devDependencies
      ? (rootPkg.devDependencies as Record<string, unknown>)
      : {}),
  };
  if (!deps["@playwright/test"] && !deps.playwright) {
    throw new SetupError(
      "playwright/package.json must declare @playwright/test (or playwright) dependency",
    );
  }

  const apiPkgPath = join(paths.apiRoot, "package.json");
  if (!existsSync(paths.apiRoot) || !existsSync(apiPkgPath)) {
    throw new SetupError("missing playwright/api package (directory + package.json)");
  }
  asRecord(readJson(apiPkgPath), "playwright/api/package.json");

  const uiPkgPath = join(paths.uiRoot, "package.json");
  if (!existsSync(paths.uiRoot) || !existsSync(uiPkgPath)) {
    throw new SetupError("missing playwright/ui stub package (directory + package.json)");
  }
  asRecord(readJson(uiPkgPath), "playwright/ui/package.json");

  // Service landing path must exist as a directory (ensure creates it empty before emit).
  if (!existsSync(paths.serviceRoot) || !statSync(paths.serviceRoot).isDirectory()) {
    throw new SetupError(
      `missing service landing path playwright/api/${serviceId}/`,
    );
  }

  return paths;
}
