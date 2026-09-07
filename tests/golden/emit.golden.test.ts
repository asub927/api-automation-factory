import { describe, expect, it } from "vitest";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { compileService } from "../../src/emit/compile.js";
import { emitZodSchemas } from "../../src/emit/zod.js";
import { emitHttpSuites, emitMcpSuites, assertNoSecretsInGenerated } from "../../src/emit/http.js";
import { ingestMcp } from "../../src/ingest/mcp.js";
import { ingestOpenApi } from "../../src/ingest/openapi.js";
import { mergeInventory } from "../../src/inventory/merge.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out.sort();
}

function expectTreesEqual(actualDir: string, goldenDir: string): void {
  const actualFiles = listFilesRecursive(actualDir).map((f) => relative(actualDir, f));
  const goldenFiles = listFilesRecursive(goldenDir).map((f) => relative(goldenDir, f));
  expect(actualFiles).toEqual(goldenFiles);
  for (const rel of goldenFiles) {
    const a = readFileSync(join(actualDir, rel), "utf8");
    const g = readFileSync(join(goldenDir, rel), "utf8");
    expect(a, rel).toBe(g);
    assertNoSecretsInGenerated(a, rel);
  }
}

function demoIr() {
  const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
  const openApi = ingestOpenApi({
    mode: "lockfile",
    path: join(root, "contracts/demo/openapi.yaml"),
  });
  return mergeInventory({
    serviceId: "demo",
    mcp,
    openApi,
    mappingPath: join(root, "support/mappings/demo.yaml"),
    exclusionPath: join(root, "support/exclusions/demo.yaml"),
    allowlistPath: join(root, "support/allowlists/demo.yaml"),
  });
}

describe("golden demo-schemas", () => {
  it("matches committed schema golden tree (U3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "golden-schemas-"));
    try {
      emitZodSchemas(demoIr(), dir);
      expectTreesEqual(dir, join(root, "tests/golden/demo-schemas.golden"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("golden demo-suites", () => {
  it("matches committed flat tests/ suite golden tree (U2)", () => {
    const dir = mkdtempSync(join(tmpdir(), "golden-suites-"));
    try {
      const ir = demoIr();
      emitHttpSuites(ir, dir);
      emitMcpSuites(ir, dir);
      expectTreesEqual(dir, join(root, "tests/golden/demo-suites.golden"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generated tree under generated/demo has no secret literals (AE10)", () => {
    compileService(root, "demo");
    for (const lane of ["tests", "schemas"] as const) {
      const dir = join(root, "generated/demo", lane);
      if (!existsSync(dir)) continue;
      for (const file of listFilesRecursive(dir)) {
        assertNoSecretsInGenerated(readFileSync(file, "utf8"), file);
      }
    }
  });
});
