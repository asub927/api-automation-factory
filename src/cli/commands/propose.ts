import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ExitCode } from "../exitCodes.js";
import { compileService } from "../../emit/compile.js";
import { emitSupportKit } from "../../emit/supportKit.js";
import { loadManifest, SetupError } from "../../inventory/manifest.js";
import { ensurePlaywrightWorkspace } from "../../scaffold/ensurePlaywrightWorkspace.js";
import { validatePlaywrightWorkspace } from "../../scaffold/validate.js";
import {
  hashIr,
  factoryBranch,
  type GitHubProposeClient,
} from "../../propose/gitBranch.js";
import { buildProposeReport, renderPrBody } from "../../propose/prBody.js";
import {
  resolveWorkspaceCheckout,
  cleanupWorkspaceCheckout,
  workspacePathGlobs,
} from "../../propose/workspaceCheckout.js";
import { classifyError } from "../../report/failureClass.js";

function generatorVersion(repoRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export interface ProposeOptions {
  repoRoot: string;
  serviceId: string;
  dryRun?: boolean;
  github?: GitHubProposeClient;
  previousIrHashPath?: string;
  /** Local app workspace checkout (clone or fixture mirror). */
  workspaceDir?: string;
  /** Optional owner/name override (tests / fixture open-pr). */
  workspaceRepo?: string;
  /** Allow shallow clone when remote and workspaceDir omitted. */
  allowClone?: boolean;
}

export async function executePropose(opts: ProposeOptions): Promise<number> {
  let checkout: ReturnType<typeof resolveWorkspaceCheckout> | undefined;
  try {
    const manifestPath = join(
      opts.repoRoot,
      "contracts",
      opts.serviceId,
      "service.manifest.yaml",
    );
    const { manifest } = loadManifest(manifestPath, opts.repoRoot);

    checkout = resolveWorkspaceCheckout({
      factoryRoot: opts.repoRoot,
      manifest,
      workspaceDir: opts.workspaceDir,
      workspaceRepo: opts.workspaceRepo,
      allowClone: opts.allowClone,
    });

    // Scaffold + validate before emit (AE15 — fail closed, no GitHub).
    const scaffold = ensurePlaywrightWorkspace(checkout.root, opts.serviceId);
    validatePlaywrightWorkspace(checkout.root, opts.serviceId);

    const emitRoot = join(checkout.root, "playwright/api", opts.serviceId);
    const supportRoot = join(checkout.root, "playwright/api/support");
    emitSupportKit(supportRoot);

    const compiled = compileService(opts.repoRoot, opts.serviceId, {
      emitRoot,
      supportImportBase: "../../support",
    });

    const version = generatorVersion(opts.repoRoot);
    const irHash = hashIr(compiled.ir, version);
    const stateDir = join(opts.repoRoot, ".factory");
    const hashPath =
      opts.previousIrHashPath ?? join(stateDir, `${opts.serviceId}.irhash`);

    if (existsSync(hashPath)) {
      const prev = readFileSync(hashPath, "utf8").trim();
      if (prev === irHash) {
        console.log(
          JSON.stringify({
            operation: "none",
            reason: "no-delta",
            irHash,
            workspaceRoot: checkout.root,
          }),
        );
        return ExitCode.OK;
      }
    }

    const report = buildProposeReport(compiled.ir, {
      generatorVersion: version,
      irHash,
    });
    const body = renderPrBody(report);
    const mergeNote =
      scaffold.playwrightConfig.written || !scaffold.playwrightConfig.mergeHint
        ? ""
        : `\n\n## Playwright config\n\n${scaffold.playwrightConfig.mergeHint}\n`;
    const fullBody = body + mergeNote;

    // Report stays in factory repo for operator audit; suites land in workspace.
    const reportPath = join(
      opts.repoRoot,
      "generated",
      opts.serviceId,
      "propose-report.json",
    );
    mkdirSync(join(opts.repoRoot, "generated", opts.serviceId), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

    const pathGlobs = workspacePathGlobs(opts.serviceId);
    const targetRepo = checkout.repo;

    if (opts.dryRun || !opts.github) {
      console.log(
        JSON.stringify({
          operation: "dry-run",
          branch: factoryBranch(opts.serviceId),
          irHash,
          reportPath,
          workspaceRoot: checkout.root,
          workspaceRepo: targetRepo,
          pathGlobs,
          emitRoot: compiled.emitRoot,
          scaffoldCreated: scaffold.created,
        }),
      );
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(hashPath, irHash + "\n", "utf8");
      return ExitCode.OK;
    }

    if (!targetRepo) {
      throw new SetupError(
        "cannot open PR: workspace.repo is required (fixture dry-run only without repo)",
      );
    }

    const result = await opts.github.openOrUpdateDraftPr({
      repo: targetRepo,
      branch: factoryBranch(opts.serviceId),
      title: `chore(tests): factory propose ${opts.serviceId}`,
      body: fullBody,
      pathGlobs,
    });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(hashPath, irHash + "\n", "utf8");
    console.log(
      JSON.stringify({
        ...result,
        irHash,
        reportPath,
        workspaceRoot: checkout.root,
        workspaceRepo: targetRepo,
        pathGlobs,
      }),
    );
    return ExitCode.OK;
  } catch (err) {
    const fc = classifyError(err);
    console.error(`${fc}: ${err instanceof Error ? err.message : String(err)}`);
    if (fc === "auth") return ExitCode.AUTH;
    if (fc === "transport") return ExitCode.TRANSPORT;
    if (fc === "contract") return ExitCode.CONTRACT;
    return ExitCode.SETUP;
  } finally {
    if (checkout) cleanupWorkspaceCheckout(checkout);
  }
}

export async function runPropose(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h")) {
    printProposeHelp();
    return ExitCode.OK;
  }

  const serviceIdx = args.findIndex((a) => a === "--service");
  const serviceId =
    serviceIdx >= 0 && args[serviceIdx + 1] ? args[serviceIdx + 1] : undefined;

  if (!serviceId) {
    console.error("setup: missing required --service <id>");
    printProposeHelp();
    return ExitCode.USAGE;
  }

  const workspaceIdx = args.findIndex((a) => a === "--workspace-dir");
  const workspaceDir =
    workspaceIdx >= 0 && args[workspaceIdx + 1] ? args[workspaceIdx + 1] : undefined;

  const dryRun = args.includes("--dry-run") || !args.includes("--open-pr");
  const allowClone = args.includes("--allow-clone");
  const repoRoot = process.cwd();
  return executePropose({
    repoRoot,
    serviceId,
    dryRun,
    workspaceDir,
    allowClone,
  });
}

export function printProposeHelp(): void {
  console.log(`Usage: factory propose --service <id> [options]

Compile MCP + OpenAPI contracts into dual-lane Playwright suites and open a
draft propose-only PR on the mapped app workspace repo. Never auto-merges.

Options:
  --service <id>         Service id from contracts/<id>/service.manifest.yaml
  --workspace-dir <path> App workspace checkout (required for remote without --allow-clone)
  --dry-run              Scaffold + emit + report only (default when --open-pr omitted)
  --open-pr              Open/update draft PR via configured GitHub client
  --allow-clone          Shallow-clone workspace.repo when --workspace-dir omitted
  --help, -h             Show this help

Landing paths (workspace repo):
  playwright/api/<serviceId>/tests/*.{http,mcp}.spec.ts
  playwright/api/<serviceId>/schemas/
  playwright/api/support/   (vendored overwrite-owned kit)

Exit codes: 0 ok, 64 usage, 78 setup, 79 auth, 80 transport, 81 contract
`);
}
