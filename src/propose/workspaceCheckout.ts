import { existsSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import type { ServiceManifest } from "../inventory/manifest.js";
import { SetupError } from "../inventory/manifest.js";

export type WorkspaceCheckout = {
  /** Absolute path to the app workspace checkout root. */
  root: string;
  /** GitHub owner/name when known (remote or overridden). */
  repo?: string;
  mode: "fixture" | "remote";
  /** True when this checkout was created in a temp dir and should be cleaned up. */
  ephemeral: boolean;
};

export type ResolveWorkspaceOptions = {
  factoryRoot: string;
  manifest: ServiceManifest;
  /** Explicit checkout path (clone or local mirror). */
  workspaceDir?: string;
  /** Optional repo override for Recording tests (owner/name). */
  workspaceRepo?: string;
  /** When true, remote mode may shallow-clone into a temp dir. */
  allowClone?: boolean;
};

/**
 * Resolve where suite files should land for this propose run.
 * Prefer --workspace-dir; otherwise fixture → fixtures/workspace-app; remote → clone.
 */
export function resolveWorkspaceCheckout(opts: ResolveWorkspaceOptions): WorkspaceCheckout {
  const mode =
    opts.manifest.workspace?.mode ??
    (opts.manifest.workspace?.repo ? "remote" : "fixture");
  const repo = opts.workspaceRepo ?? opts.manifest.workspace?.repo;

  if (opts.workspaceDir) {
    if (!existsSync(opts.workspaceDir)) {
      throw new SetupError(`workspace dir not found: ${opts.workspaceDir}`);
    }
    return {
      root: opts.workspaceDir,
      repo,
      mode: mode === "remote" ? "remote" : "fixture",
      ephemeral: false,
    };
  }

  if (mode === "fixture") {
    const fixtureRoot = join(opts.factoryRoot, "fixtures/workspace-app");
    if (!existsSync(fixtureRoot)) {
      throw new SetupError(
        "fixture workspace missing: fixtures/workspace-app (run scaffold or pass --workspace-dir)",
      );
    }
    // Copy so propose does not dirty the committed fixture during local runs/tests.
    const copy = mkdtempSync(join(tmpdir(), "factory-ws-fixture-"));
    cpSync(fixtureRoot, copy, { recursive: true });
    return {
      root: copy,
      repo: repo ?? "fixture/workspace-app",
      mode: "fixture",
      ephemeral: true,
    };
  }

  if (!repo) {
    throw new SetupError("workspace.repo is required for remote propose");
  }

  if (!opts.allowClone) {
    throw new SetupError(
      `remote workspace ${repo} requires --workspace-dir (or allowClone for automated clone)`,
    );
  }

  const branch = opts.manifest.workspace?.defaultBranch ?? "main";
  const dir = mkdtempSync(join(tmpdir(), "factory-ws-clone-"));
  try {
    execFileSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        `https://github.com/${repo}.git`,
        dir,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    rmSync(dir, { recursive: true, force: true });
    throw new SetupError(
      `failed to clone workspace ${repo}@${branch}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { root: dir, repo, mode: "remote", ephemeral: true };
}

export function cleanupWorkspaceCheckout(checkout: WorkspaceCheckout): void {
  if (checkout.ephemeral) {
    rmSync(checkout.root, { recursive: true, force: true });
  }
}

/** Path globs allowed on workspace draft PRs (playwright landing only). */
export function workspacePathGlobs(serviceId: string): string[] {
  return [
    `playwright/api/${serviceId}/**`,
    "playwright/api/support/**",
    "playwright/package.json",
    "playwright/api/package.json",
    "playwright/ui/**",
    "playwright/playwright.config.ts",
  ];
}
