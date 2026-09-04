import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { ingestMcp } from "../../../src/ingest/mcp.js";
import { ingestOpenApi } from "../../../src/ingest/openapi.js";
import { mergeInventory } from "../../../src/inventory/merge.js";
import { emitZodSchemas } from "../../../src/emit/zod.js";
import { COVERAGE_IR_VERSION } from "../../../src/inventory/ir.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

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
    allowlistPath: join(root, "support/allowlists/demo.yaml"),
  });
}

describe("zod emit", () => {
  it("emits shared response schema for mapped tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "zod-emit-"));
    try {
      const files = emitZodSchemas(demoIr(), dir);
      expect(files.some((f) => f.endsWith("getOrderById.schema.ts"))).toBe(true);
      const body = readFileSync(join(dir, "getOrderById.schema.ts"), "utf8");
      expect(body).toContain("GENERATED");
      expect(body).toContain("getOrderByIdResponseSchema");
      expect(body).toContain("z.object");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits usable schema for MCP-only tool (KD7)", () => {
    const dir = mkdtempSync(join(tmpdir(), "zod-emit-"));
    try {
      emitZodSchemas(demoIr(), dir);
      const body = readFileSync(join(dir, "listRecentOrders.schema.ts"), "utf8");
      expect(body).toContain("listRecentOrdersResponseSchema");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is byte-identical across runs (golden stability)", () => {
    const a = mkdtempSync(join(tmpdir(), "zod-a-"));
    const b = mkdtempSync(join(tmpdir(), "zod-b-"));
    try {
      emitZodSchemas(demoIr(), a);
      emitZodSchemas(demoIr(), b);
      const fa = readFileSync(join(a, "index.ts"), "utf8");
      const fb = readFileSync(join(b, "index.ts"), "utf8");
      expect(fa).toBe(fb);
      expect(readFileSync(join(a, "getOrderById.schema.ts"), "utf8")).toBe(
        readFileSync(join(b, "getOrderById.schema.ts"), "utf8"),
      );
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("refuses unsupported IR major version", () => {
    const dir = mkdtempSync(join(tmpdir(), "zod-bad-"));
    try {
      expect(() =>
        emitZodSchemas(
          {
            version: "coverage-ir/v9",
            serviceId: "demo",
            capabilities: [],
            drift: [],
            uncovered: [],
            intentionallyUncovered: [],
          },
          dir,
        ),
      ).toThrow(/unsupported coverage IR version/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses coverage-ir/v1 constant", () => {
    expect(COVERAGE_IR_VERSION).toBe("coverage-ir/v1");
  });
});
