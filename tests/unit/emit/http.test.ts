import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { compileService } from "../../../src/emit/compile.js";
import { emitHttpSuites, emitMcpSuites, assertNoSecretsInGenerated } from "../../../src/emit/http.js";
import { ingestMcp } from "../../../src/ingest/mcp.js";
import { ingestOpenApi } from "../../../src/ingest/openapi.js";
import { mergeInventory } from "../../../src/inventory/merge.js";
import { loadProfile, AuthError } from "../../../src/auth/loadProfile.js";
import { writeFileSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("dual-lane emit", () => {
  it("emits HTTP + MCP specs for mapped capability (AE1)", () => {
    const result = compileService(root, "demo");
    expect(result.httpFiles.some((f) => f.includes("getOrderById"))).toBe(true);
    expect(result.mcpFiles.some((f) => f.includes("getOrderById"))).toBe(true);
    expect(existsSync(join(root, "generated/demo/schemas/getOrderById.schema.ts"))).toBe(true);
  });

  it("does not emit live MCP for non-allowlisted mutating tool (AE7)", () => {
    const result = compileService(root, "demo");
    expect(result.mcpFiles.some((f) => f.includes("deleteOrder"))).toBe(false);
    expect(
      result.ir.intentionallyUncovered.some((u) => u.toolName === "deleteOrder"),
    ).toBe(true);
  });

  it("rejects secret-like content in generated trees (AE10)", () => {
    expect(() =>
      assertNoSecretsInGenerated('Authorization: Bearer sk-abc1234567890', "x.ts"),
    ).toThrow(/secret-like/);
  });

  it("regen overwrites generated paths only", () => {
    compileService(root, "demo");
    const first = readFileSync(
      join(root, "generated/demo/http/getOrderById.generated.spec.ts"),
      "utf8",
    );
    compileService(root, "demo");
    const second = readFileSync(
      join(root, "generated/demo/http/getOrderById.generated.spec.ts"),
      "utf8",
    );
    expect(first).toBe(second);
    expect(existsSync(join(root, "support/fixtures/auth.ts"))).toBe(true);
  });
});

describe("auth profile loader", () => {
  it("loads demo profile with env names only", () => {
    const profile = loadProfile(join(root, "support/profiles/demo.yaml"));
    expect(profile.env.token).toBe("DEMO_API_TOKEN");
  });

  it("rejects value-like secret material (AE10)", () => {
    const dir = mkdtempSync(join(tmpdir(), "auth-"));
    const path = join(dir, "bad.yaml");
    writeFileSync(
      path,
      `id: bad\ntype: bearer\nenv:\n  token: "sk-thisIsARealLookingSecretValue"\n`,
    );
    try {
      expect(() => loadProfile(path)).toThrow(AuthError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
