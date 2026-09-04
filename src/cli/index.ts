#!/usr/bin/env node
import { ExitCode } from "./exitCodes.js";
import { printProposeHelp, runPropose } from "./commands/propose.js";

function printRootHelp(): void {
  console.log(`Usage: factory <command> [options]

Compile-first API automation factory.
Turns MCP tool surfaces + OpenAPI contracts into deterministic Playwright
HTTP + MCP suites with Zod validation. Propose-only PRs; never auto-merges.

Commands:
  propose   Compile suites and open/update a draft propose PR
  help      Show this help

Global options:
  --help, -h   Show help

LLM assistance is optional and off by default.

Exit codes: 0 ok, 2 unknown command, 64 usage, 78 setup, 79 auth, 80 transport, 81 contract
`);
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printRootHelp();
    return ExitCode.OK;
  }

  if (command === "propose") {
    return runPropose(args.slice(1));
  }

  console.error(`unknown command: ${command}`);
  printRootHelp();
  return ExitCode.UNKNOWN_COMMAND;
}

const code = await main(process.argv);
process.exit(code);
