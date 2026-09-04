import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMcp } from "../../../src/ingest/mcp.js";
import { ingestOpenApi } from "../../../src/ingest/openapi.js";
import { mergeInventory } from "../../../src/inventory/merge.js";
import { loadManifest, SetupError, assertEgressAllowed } from "../../../src/inventory/manifest.js";
import { mapToolsToHttp, loadMappingOverrides } from "../../../src/inventory/map.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("inventory merge", () => {
  it("maps getOrderById to OpenAPI operation (AE1 inputs)", () => {
    const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
    const openApi = ingestOpenApi({
      mode: "lockfile",
      path: join(root, "contracts/demo/openapi.yaml"),
    });
    const ir = mergeInventory({
      serviceId: "demo",
      mcp,
      openApi,
      mappingPath: join(root, "support/mappings/demo.yaml"),
      exclusionPath: join(root, "support/exclusions/demo.yaml"),
      allowlistPath: join(root, "support/allowlists/demo.yaml"),
    });

    const order = ir.capabilities.find((c) => c.toolName === "getOrderById");
    expect(order?.httpMapped).toBe(true);
    expect(order?.operationId).toBe("getOrderById");
    expect(order?.hasOpenApiEnrichment).toBe(true);
    expect(ir.version).toBe("coverage-ir/v1");
  });

  it("keeps unmapped MCP tool on coverage floor when not excluded (AE2/AE5)", () => {
    const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
    const openApi = ingestOpenApi({
      mode: "lockfile",
      path: join(root, "contracts/demo/openapi.yaml"),
    });
    const ir = mergeInventory({
      serviceId: "demo",
      mcp,
      openApi,
      mappingPath: join(root, "support/mappings/demo.yaml"),
      // no exclusionPath — AE5 uncovered list path
      allowlistPath: join(root, "support/allowlists/demo.yaml"),
    });

    const recent = ir.capabilities.find((c) => c.toolName === "listRecentOrders");
    expect(recent).toBeTruthy();
    expect(recent?.httpMapped).toBe(false);
    expect(ir.uncovered.some((u) => u.toolName === "listRecentOrders")).toBe(true);
  });

  it("excludes MCP-only KD7 tool from R6 rollout while keeping propose floor", () => {
    const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
    const openApi = ingestOpenApi({
      mode: "lockfile",
      path: join(root, "contracts/demo/openapi.yaml"),
    });
    const ir = mergeInventory({
      serviceId: "demo",
      mcp,
      openApi,
      mappingPath: join(root, "support/mappings/demo.yaml"),
      exclusionPath: join(root, "support/exclusions/demo.yaml"),
      allowlistPath: join(root, "support/allowlists/demo.yaml"),
    });

    const recent = ir.capabilities.find((c) => c.toolName === "listRecentOrders");
    expect(recent).toBeTruthy();
    expect(recent?.httpMapped).toBe(false);
    expect(ir.uncovered.some((u) => u.toolName === "listRecentOrders")).toBe(false);
    expect(
      ir.intentionallyUncovered.some(
        (u) =>
          u.toolName === "listRecentOrders" &&
          u.reason === "rollout-excluded-kd7-mcp-only-proof",
      ),
    ).toBe(true);
  });

  it("marks mutating tools intentionally uncovered without allowlist (AE7)", () => {
    const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
    const openApi = ingestOpenApi({
      mode: "lockfile",
      path: join(root, "contracts/demo/openapi.yaml"),
    });
    const ir = mergeInventory({
      serviceId: "demo",
      mcp,
      openApi,
      allowlistPath: join(root, "support/allowlists/demo.yaml"),
    });

    expect(
      ir.intentionallyUncovered.some(
        (u) => u.toolName === "deleteOrder" && u.reason === "mutation-not-allowlisted",
      ),
    ).toBe(true);
  });

  it("records spring-missing drift without dropping MCP tools", () => {
    const mcp = ingestMcp(join(root, "contracts/demo/mcp-tools.json"));
    const ir = mergeInventory({
      serviceId: "demo",
      mcp,
      openApiMissing: true,
    });
    expect(ir.capabilities.length).toBe(mcp.tools.length);
    expect(ir.drift.some((d) => d.code === "spring-missing")).toBe(true);
  });

  it("empty MCP tool list yields empty coverage", () => {
    const ir = mergeInventory({
      serviceId: "demo",
      mcp: { tools: [], digest: "x", raw: { tools: [] } },
      openApiMissing: true,
    });
    expect(ir.capabilities).toEqual([]);
  });
});

describe("mapping overrides", () => {
  it("forces divergent name pair via override table", () => {
    const tools = [{ name: "fetchOrder" }];
    const operations = [
      { operationId: "getOrderById", method: "GET", path: "/orders/{orderId}" },
    ];
    const results = mapToolsToHttp(tools, operations, [
      { toolName: "fetchOrder", operationId: "getOrderById" },
    ]);
    expect(results[0].httpMapped).toBe(true);
    expect(results[0].via).toBe("override");
  });
});

describe("manifest egress", () => {
  it("loads demo manifest", () => {
    const { manifest } = loadManifest(
      join(root, "contracts/demo/service.manifest.yaml"),
      root,
    );
    expect(manifest.serviceId).toBe("demo");
  });

  it("denies disallowed baseUrl (AE12)", () => {
    expect(() =>
      assertEgressAllowed("https://evil.example.com", ["localhost"], {
        allowHttpLocalhost: true,
      }),
    ).toThrow(SetupError);
  });
});
