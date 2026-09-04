import { readFileSync, existsSync } from "node:fs";
import YAML from "yaml";
import type { McpToolDef } from "../ingest/mcp.js";
import type { OpenApiOperation } from "../ingest/openapi.js";
import type { MutationClass } from "./ir.js";

export interface MappingOverride {
  toolName: string;
  operationId?: string;
  method?: string;
  path?: string;
}

export interface MappingResult {
  toolName: string;
  operation?: OpenApiOperation;
  httpMapped: boolean;
  via: "override" | "operationId" | "path-heuristic" | "none";
  warning?: string;
}

const MUTATING_VERBS = /^(create|update|delete|remove|put|post|patch|write|set|add|upload|send|execute|invoke|run)/i;

export function classifyMutation(tool: McpToolDef): MutationClass {
  if (tool.annotations?.destructiveHint === true) return "mutating";
  if (tool.annotations?.readOnlyHint === true) return "read";
  if (MUTATING_VERBS.test(tool.name)) return "mutating";
  if (/^(get|list|read|find|fetch|describe|show|lookup)/i.test(tool.name)) return "read";
  return "unknown";
}

export function loadMappingOverrides(path?: string): MappingOverride[] {
  if (!path || !existsSync(path)) return [];
  const doc = YAML.parse(readFileSync(path, "utf8")) as {
    mappings?: MappingOverride[];
  };
  return doc.mappings ?? [];
}

export function loadNameList(
  path: string | undefined,
  key: "exclusions" | "allowlist",
): Array<{ toolName: string; reason?: string }> {
  if (!path || !existsSync(path)) return [];
  const doc = YAML.parse(readFileSync(path, "utf8")) as Record<
    string,
    Array<{ toolName: string; reason?: string } | string>
  >;
  const entries = doc[key] ?? doc.tools ?? [];
  return entries.map((e) =>
    typeof e === "string" ? { toolName: e } : { toolName: e.toolName, reason: e.reason },
  );
}

export function mapToolsToHttp(
  tools: McpToolDef[],
  operations: OpenApiOperation[],
  overrides: MappingOverride[],
): MappingResult[] {
  const byOpId = new Map(
    operations.filter((o) => o.operationId).map((o) => [o.operationId!.toLowerCase(), o]),
  );
  const byMethodPath = new Map(
    operations.map((o) => [`${o.method}:${o.path}`.toLowerCase(), o]),
  );

  return tools.map((tool) => {
    const override = overrides.find((o) => o.toolName === tool.name);
    if (override) {
      let operation: OpenApiOperation | undefined;
      if (override.operationId) {
        operation = byOpId.get(override.operationId.toLowerCase());
      }
      if (!operation && override.method && override.path) {
        operation = byMethodPath.get(
          `${override.method}:${override.path}`.toLowerCase(),
        );
      }
      let warning: string | undefined;
      if (operation && override.method && operation.method !== override.method.toUpperCase()) {
        warning = `override method ${override.method} disagrees with OpenAPI ${operation.method}`;
      }
      return {
        toolName: tool.name,
        operation,
        httpMapped: !!operation,
        via: "override" as const,
        warning,
      };
    }

    const byId = byOpId.get(tool.name.toLowerCase());
    if (byId) {
      return {
        toolName: tool.name,
        operation: byId,
        httpMapped: true,
        via: "operationId" as const,
      };
    }

    // Light path heuristic: tool getOrderById ↔ GET .../{id} with operationId containing order
    const heuristic = operations.find((o) => {
      if (!o.operationId) return false;
      const norm = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
      return norm(o.operationId) === norm(tool.name);
    });
    if (heuristic) {
      return {
        toolName: tool.name,
        operation: heuristic,
        httpMapped: true,
        via: "path-heuristic" as const,
      };
    }

    return {
      toolName: tool.name,
      httpMapped: false,
      via: "none" as const,
    };
  });
}
