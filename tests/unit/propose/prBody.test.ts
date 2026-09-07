import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, cpSync, writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { compileService } from "../../../src/emit/compile.js";
import { hashIr, RecordingGitHubClient, factoryBranch } from "../../../src/propose/gitBranch.js";
import { buildProposeReport, renderPrBody } from "../../../src/propose/prBody.js";
import { executePropose } from "../../../src/cli/commands/propose.js";
import { workspacePathGlobs } from "../../../src/propose/workspaceCheckout.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function seedFactoryTmp(): string {
  const tmp = mkdtempSync(join(tmpdir(), "propose-"));
  cpSync(join(root, "contracts"), join(tmp, "contracts"), { recursive: true });
  cpSync(join(root, "support"), join(tmp, "support"), { recursive: true });
  cpSync(join(root, "package.json"), join(tmp, "package.json"));
  cpSync(join(root, "fixtures/workspace-app"), join(tmp, "fixtures/workspace-app"), {
    recursive: true,
  });
  return tmp;
}

describe("propose PR body", () => {
  it("includes Drift and Uncovered sections", () => {
    const compiled = compileService(root, "demo");
    const irHash = hashIr(compiled.ir, "0.1.0");
    const body = renderPrBody(
      buildProposeReport(compiled.ir, { generatorVersion: "0.1.0", irHash }),
    );
    expect(body).toContain("## Drift");
    expect(body).toContain("## Uncovered");
    expect(body).toContain("## Intentionally uncovered");
    expect(body).toMatch(/never auto-merged/i);
  });
});

describe("workspace propose path (U5)", () => {
  it("Recording client receives draft PR for owner/app with playwright path globs only (AE3/AE11/AE13)", async () => {
    const client = new RecordingGitHubClient();
    const tmp = seedFactoryTmp();
    const workspaceDir = join(tmp, "app-ws");
    cpSync(join(tmp, "fixtures/workspace-app"), workspaceDir, { recursive: true });
    try {
      const code = await executePropose({
        repoRoot: tmp,
        serviceId: "demo",
        dryRun: false,
        github: client,
        workspaceDir,
        workspaceRepo: "acme/app",
      });
      expect(code).toBe(0);
      client.assertNoMerge();
      expect(client.calls).toHaveLength(1);
      const call = client.calls[0]!;
      expect(call.draft).toBe(true);
      expect(call.repo).toBe("acme/app");
      expect(call.branch).toBe(factoryBranch("demo"));
      const globs = call.pathGlobs as string[];
      expect(globs.every((g) => g.startsWith("playwright/"))).toBe(true);
      expect(globs).toEqual(workspacePathGlobs("demo"));
      expect(existsSync(join(workspaceDir, "playwright/api/demo/tests"))).toBe(true);
      expect(existsSync(join(workspaceDir, "playwright/api/support/auth.ts"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("skips PR on no-delta (AE8)", async () => {
    const tmp = seedFactoryTmp();
    const workspaceDir = join(tmp, "app-ws");
    cpSync(join(tmp, "fixtures/workspace-app"), workspaceDir, { recursive: true });
    try {
      const first = await executePropose({
        repoRoot: tmp,
        serviceId: "demo",
        dryRun: true,
        workspaceDir,
      });
      expect(first).toBe(0);
      const client = new RecordingGitHubClient();
      const second = await executePropose({
        repoRoot: tmp,
        serviceId: "demo",
        dryRun: false,
        github: client,
        workspaceDir,
        workspaceRepo: "acme/app",
      });
      expect(second).toBe(0);
      expect(client.calls).toHaveLength(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("validation failure aborts before GitHub call (AE15)", async () => {
    const client = new RecordingGitHubClient();
    const tmp = seedFactoryTmp();
    const workspaceDir = mkdtempSync(join(tmpdir(), "broken-ws-"));
    try {
      mkdirSync(join(workspaceDir, "playwright"), { recursive: true });
      writeFileSync(join(workspaceDir, "playwright/package.json"), "{ not-json ");
      const code = await executePropose({
        repoRoot: tmp,
        serviceId: "demo",
        dryRun: false,
        github: client,
        workspaceDir,
        workspaceRepo: "acme/app",
      });
      expect(code).toBe(78); // SETUP
      expect(client.calls).toHaveLength(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  it("client never invoked with merge/approve", async () => {
    const client = new RecordingGitHubClient();
    const tmp = seedFactoryTmp();
    const workspaceDir = join(tmp, "app-ws");
    cpSync(join(tmp, "fixtures/workspace-app"), workspaceDir, { recursive: true });
    try {
      await executePropose({
        repoRoot: tmp,
        serviceId: "demo",
        dryRun: false,
        github: client,
        workspaceDir,
        workspaceRepo: "acme/app",
      });
      expect(() => client.assertNoMerge()).not.toThrow();
      for (const call of client.calls) {
        expect(String(call.method)).not.toMatch(/merge|approve/i);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
