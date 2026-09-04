import type { McpInventory } from "../ingest/mcp.js";
import type { OpenApiInventory } from "../ingest/openapi.js";
import {
  COVERAGE_IR_VERSION,
  type CoverageIr,
  type Capability,
  type DriftFinding,
  type UncoveredItem,
} from "./ir.js";
import {
  classifyMutation,
  loadMappingOverrides,
  loadNameList,
  mapToolsToHttp,
} from "./map.js";

export interface MergeInputs {
  serviceId: string;
  mcp: McpInventory;
  openApi?: OpenApiInventory;
  openApiMissing?: boolean;
  mappingPath?: string;
  exclusionPath?: string;
  allowlistPath?: string;
}

export function mergeInventory(input: MergeInputs): CoverageIr {
  const overrides = loadMappingOverrides(input.mappingPath);
  const exclusions = new Map(
    loadNameList(input.exclusionPath, "exclusions").map((e) => [e.toolName, e.reason]),
  );
  const allowlist = new Set(
    loadNameList(input.allowlistPath, "allowlist").map((e) => e.toolName),
  );

  const operations = input.openApi?.operations ?? [];
  const mappings = mapToolsToHttp(input.mcp.tools, operations, overrides);

  const drift: DriftFinding[] = [];
  const uncovered: UncoveredItem[] = [];
  const intentionallyUncovered: UncoveredItem[] = [];
  const capabilities: Capability[] = [];

  if (input.openApiMissing) {
    drift.push({
      code: "spring-missing",
      severity: "WARN",
      message: "OpenAPI/Spring enrichment missing; MCP coverage floor applies (KD7)",
    });
  }

  for (const m of mappings) {
    const tool = input.mcp.tools.find((t) => t.name === m.toolName)!;
    const mutationClass = classifyMutation(tool);
    const excluded = exclusions.has(tool.name);

    // Exclusions remove the tool from R6 rollout completeness but keep MCP-floor
    // propose coverage (KD7 / demo DoD). Mutating tools without allowlist are
    // intentionally uncovered and not invoked live.
    if (excluded) {
      intentionallyUncovered.push({
        kind: "intentionally-uncovered",
        toolName: tool.name,
        reason: exclusions.get(tool.name) ?? "excluded",
      });
    } else if (mutationClass !== "read" && !allowlist.has(tool.name)) {
      intentionallyUncovered.push({
        kind: "intentionally-uncovered",
        toolName: tool.name,
        reason: "mutation-not-allowlisted",
      });
    }

    if (m.warning) {
      drift.push({
        code: "mapping-incompatible",
        severity: "WARN",
        toolName: tool.name,
        operationId: m.operation?.operationId,
        message: m.warning,
      });
    }

    if (!m.httpMapped && !excluded) {
      uncovered.push({
        kind: "unmapped",
        toolName: tool.name,
        reason: "no HTTP mapping after heuristics and overrides",
      });
    }

    if (input.openApiMissing || (!m.operation && m.httpMapped === false)) {
      // already recorded; enrichment thin
    } else if (m.httpMapped && !m.operation?.responseSchema) {
      drift.push({
        code: "thin-response-schema",
        severity: "INFO",
        toolName: tool.name,
        operationId: m.operation?.operationId,
        message: "mapped operation lacks response schema enrichment",
      });
    }

    capabilities.push({
      id: `${input.serviceId}:${tool.name}`,
      toolName: tool.name,
      httpMapped: m.httpMapped,
      method: m.operation?.method,
      path: m.operation?.path,
      operationId: m.operation?.operationId,
      mutationClass,
      hasOpenApiEnrichment: !!m.operation?.responseSchema,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      openApiRequestSchema: m.operation?.requestSchema,
      openApiResponseSchema: m.operation?.responseSchema,
    });
  }

  // OpenAPI ops with no MCP tool → INFO uncovered endpoint
  const mappedOpIds = new Set(
    capabilities.filter((c) => c.operationId).map((c) => c.operationId!.toLowerCase()),
  );
  for (const op of operations) {
    if (op.operationId && !mappedOpIds.has(op.operationId.toLowerCase())) {
      uncovered.push({
        kind: "unmapped",
        operationId: op.operationId,
        reason: "HTTP operation has no MCP tool",
      });
      drift.push({
        code: "http-without-mcp",
        severity: "INFO",
        operationId: op.operationId,
        message: `${op.method} ${op.path} has no MCP tool`,
      });
    }
  }

  capabilities.sort((a, b) => a.id.localeCompare(b.id));
  drift.sort((a, b) => (a.toolName ?? a.operationId ?? "").localeCompare(b.toolName ?? b.operationId ?? ""));
  uncovered.sort((a, b) => (a.toolName ?? a.operationId ?? "").localeCompare(b.toolName ?? b.operationId ?? ""));

  return {
    version: COVERAGE_IR_VERSION,
    serviceId: input.serviceId,
    openApiDigest: input.openApi?.digest,
    openApiUri: input.openApi?.uri,
    mcpDigest: input.mcp.digest,
    capabilities,
    drift,
    uncovered,
    intentionallyUncovered,
  };
}
