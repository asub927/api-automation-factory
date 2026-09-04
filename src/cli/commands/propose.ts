import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ExitCode } from "../exitCodes.js";
import { compileService } from "../../emit/compile.js";
import { hashIr, factoryBranch, type GitHubProposeClient } from "../../propose/gitBranch.js";
import { buildProposeReport, renderPrBody } from "../../propose/prBody.js";
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
}

export async function executePropose(opts: ProposeOptions): Promise<number> {
  try {
    const compiled = compileService(opts.repoRoot, opts.serviceId);
    const version = generatorVersion(opts.repoRoot);
    const irHash = hashIr(compiled.ir, version);
    const stateDir = join(opts.repoRoot, ".factory");
    const hashPath =
      opts.previousIrHashPath ?? join(stateDir, `${opts.serviceId}.irhash`);

    if (existsSync(hashPath)) {
      const prev = readFileSync(hashPath, "utf8").trim();
      if (prev === irHash) {
        console.log(JSON.stringify({ operation: "none", reason: "no-delta", irHash }));
        return ExitCode.OK;
      }
    }

    const report = buildProposeReport(compiled.ir, {
      generatorVersion: version,
      irHash,
    });
    const body = renderPrBody(report);
    const reportPath = join(opts.repoRoot, "generated", opts.serviceId, "propose-report.json");
    mkdirSync(join(opts.repoRoot, "generated", opts.serviceId), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

    if (opts.dryRun || !opts.github) {
      console.log(
        JSON.stringify({
          operation: "dry-run",
          branch: factoryBranch(opts.serviceId),
          irHash,
          reportPath,
        }),
      );
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(hashPath, irHash + "\n", "utf8");
      return ExitCode.OK;
    }

    const result = await opts.github.openOrUpdateDraftPr({
      branch: factoryBranch(opts.serviceId),
      title: `chore(tests): factory propose ${opts.serviceId}`,
      body,
      pathGlobs: [`generated/${opts.serviceId}/**`],
    });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(hashPath, irHash + "\n", "utf8");
    console.log(JSON.stringify({ ...result, irHash, reportPath }));
    return ExitCode.OK;
  } catch (err) {
    const fc = classifyError(err);
    console.error(`${fc}: ${err instanceof Error ? err.message : String(err)}`);
    if (fc === "auth") return ExitCode.AUTH;
    if (fc === "transport") return ExitCode.TRANSPORT;
    if (fc === "contract") return ExitCode.CONTRACT;
    return ExitCode.SETUP;
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

  const dryRun = args.includes("--dry-run") || !args.includes("--open-pr");
  const repoRoot = process.cwd();
  return executePropose({ repoRoot, serviceId, dryRun });
}

export function printProposeHelp(): void {
  console.log(`Usage: factory propose --service <id> [options]

Compile MCP + OpenAPI contracts into dual-lane Playwright suites and open a
draft propose-only PR for human review. Never auto-merges.

Options:
  --service <id>   Service id from contracts/<id>/service.manifest.yaml
  --dry-run        Compile + report only (default when --open-pr omitted)
  --open-pr        Open/update draft PR via configured GitHub client
  --help, -h       Show this help

Exit codes: 0 ok, 64 usage, 78 setup, 79 auth, 80 transport, 81 contract
`);
}
