import { readFileSync, existsSync } from "node:fs";
import { sha256Hex, SetupError } from "../inventory/manifest.js";

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}

export interface McpInventory {
  tools: McpToolDef[];
  digest: string;
  raw: unknown;
}

export function ingestMcp(path: string): McpInventory {
  if (!existsSync(path)) {
    throw new SetupError(`MCP definitions not found: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const raw = JSON.parse(text) as {
    tools?: McpToolDef[];
  };
  const tools = [...(raw.tools ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  if (tools.length === 0) {
    // Empty is allowed: explicit empty coverage report downstream.
  }
  return { tools, digest: sha256Hex(text), raw };
}
