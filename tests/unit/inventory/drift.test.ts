import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMcp } from "../../../src/ingest/mcp.js";
import { ingestOpenApi } from "../../../src/ingest/openapi.js";
import { mergeInventory } from "../../../src/inventory/merge.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("drift reporting", () => {
  it("lists HTTP-without-MCP as INFO drift", () => {
    const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
    const openApi = ingestOpenApi({
      mode: "lockfile",
      path: join(root, "contracts/demo/openapi.yaml"),
    });
    const ir = mergeInventory({ serviceId: "demo", mcp, openApi });
    expect(ir.drift.some((d) => d.code === "http-without-mcp")).toBe(true);
    expect(ir.uncovered.some((u) => u.operationId === "getHealth")).toBe(true);
  });
});
