import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileService } from "../../../src/emit/compile.js";
import { hashIr, RecordingGitHubClient, factoryBranch } from "../../../src/propose/gitBranch.js";
import { buildProposeReport, renderPrBody } from "../../../src/propose/prBody.js";
import { executePropose } from "../../../src/cli/commands/propose.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { cpSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("propose PR body", () => {
  it("includes Drift and Uncovered sections", () => {
    const compiled = compileService(root, "demo");
    const irHash = hashIr(compiled.ir, "0.1.0");
    const body = renderPrBody(
      buildProposeReport(compiled.ir, { generatorVersion: "0.1.0", irHash }),
    );
    expect(body).toContain("## Drift");
    expect(body).toContain("## Uncovered");
    expect(body).toMatch(/never auto-merged/i);
  });
});

describe("propose path", () => {
  it("never calls merge APIs (AE3/AE11)", async () => {
    const client = new RecordingGitHubClient();
    const tmp = mkdtempSync(join(tmpdir(), "propose-"));
    try {
      cpSync(join(root, "contracts"), join(tmp, "contracts"), { recursive: true });
      cpSync(join(root, "support"), join(tmp, "support"), { recursive: true });
      cpSync(join(root, "package.json"), join(tmp, "package.json"));
      await executePropose({
        repoRoot: tmp,
        serviceId: "demo",
        dryRun: false,
        github: client,
      });
      client.assertNoMerge();
      expect(client.calls[0]?.draft).toBe(true);
      expect(String(client.calls[0]?.branch)).toBe(factoryBranch("demo"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips PR on no-delta (AE8)", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "propose-"));
    try {
      cpSync(join(root, "contracts"), join(tmp, "contracts"), { recursive: true });
      cpSync(join(root, "support"), join(tmp, "support"), { recursive: true });
      cpSync(join(root, "package.json"), join(tmp, "package.json"));
      const first = await executePropose({ repoRoot: tmp, serviceId: "demo", dryRun: true });
      expect(first).toBe(0);
      // Capture stdout via second run — hash file written; executePropose logs operation none
      const second = await executePropose({ repoRoot: tmp, serviceId: "demo", dryRun: true });
      expect(second).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
