import { ExitCode } from "../exitCodes.js";

/**
 * Propose stub (U1). Full ingest→emit→PR lands in U5.
 * LLM remains optional/off by default (R8 / KTD14).
 */
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

  console.error(
    `setup: propose for service '${serviceId}' is not fully wired yet (U5). Use --help for usage.`,
  );
  return ExitCode.SETUP;
}

export function printProposeHelp(): void {
  console.log(`Usage: factory propose --service <id> [options]

Compile MCP + OpenAPI contracts into dual-lane Playwright suites and open a
draft propose-only PR for human review. Never auto-merges.

Options:
  --service <id>   Service id from contracts/<id>/service.manifest.yaml
  --help, -h       Show this help

Exit codes: 0 ok, 64 usage, 78 setup, 79 auth, 80 transport, 81 contract
`);
}
