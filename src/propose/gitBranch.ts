import { createHash } from "node:crypto";
import type { CoverageIr } from "../inventory/ir.js";

export function hashIr(ir: CoverageIr, generatorVersion: string): string {
  const payload = JSON.stringify({
    version: ir.version,
    serviceId: ir.serviceId,
    openApiDigest: ir.openApiDigest,
    mcpDigest: ir.mcpDigest,
    capabilities: ir.capabilities,
    drift: ir.drift,
    uncovered: ir.uncovered,
    intentionallyUncovered: ir.intentionallyUncovered,
    generatorVersion,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export type ProposeOperation = "created" | "updated" | "none";

export interface OpenDraftPrInput {
  /** Target GitHub repo as owner/name. */
  repo: string;
  branch: string;
  title: string;
  body: string;
  pathGlobs: string[];
}

export interface GitHubProposeClient {
  openOrUpdateDraftPr(
    input: OpenDraftPrInput,
  ): Promise<{ operation: ProposeOperation; number?: number }>;
}

/** Recording client used in unit tests (AE11) — draft-only, never merge/approve. */
export class RecordingGitHubClient implements GitHubProposeClient {
  calls: Array<Record<string, unknown>> = [];

  async openOrUpdateDraftPr(
    input: OpenDraftPrInput,
  ): Promise<{ operation: ProposeOperation; number?: number }> {
    this.calls.push({ method: "openOrUpdateDraftPr", ...input, draft: true });
    if (!input.repo.includes("/")) {
      throw new Error("repo must be owner/name");
    }
    if (!input.branch.startsWith("factory/")) {
      throw new Error("refusing non-factory branch");
    }
    for (const g of input.pathGlobs) {
      if (!g.startsWith("playwright/")) {
        throw new Error(`path glob outside playwright/: ${g}`);
      }
    }
    return { operation: "created", number: 1 };
  }

  assertNoMerge(): void {
    for (const c of this.calls) {
      if (String(c.method).includes("merge") || String(c.method).includes("approve")) {
        throw new Error("merge/approve called");
      }
    }
  }
}

export function factoryBranch(serviceId: string): string {
  return `factory/${serviceId}`;
}
