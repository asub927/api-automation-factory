import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMcp } from "../ingest/mcp.js";
import { ingestOpenApi } from "../ingest/openapi.js";
import { mergeInventory } from "../inventory/merge.js";
import { loadManifest } from "../inventory/manifest.js";
import { emitZodSchemas } from "./zod.js";
import { emitHttpSuites } from "./http.js";
import { emitMcpSuites } from "./mcp.js";

export interface CompileResult {
  ir: ReturnType<typeof mergeInventory>;
  schemaFiles: string[];
  httpFiles: string[];
  mcpFiles: string[];
}

export function compileService(repoRoot: string, serviceId: string): CompileResult {
  const manifestPath = join(repoRoot, "contracts", serviceId, "service.manifest.yaml");
  const { manifest, abs } = loadManifest(manifestPath, repoRoot);
  const mcp = ingestMcp(abs.mcpPath);
  let openApi;
  let openApiMissing = false;
  try {
    openApi = ingestOpenApi({
      mode: manifest.openApi.mode,
      path: abs.openApiPath,
      url: manifest.openApi.url,
    });
  } catch (err) {
    openApiMissing = true;
    if (manifest.openApi.mode === "lockfile") {
      // KD7: continue without enrichment
      openApi = undefined;
    } else {
      throw err;
    }
  }

  const ir = mergeInventory({
    serviceId: manifest.serviceId,
    mcp,
    openApi,
    openApiMissing: openApiMissing || !openApi,
    mappingPath: abs.mappingPath || undefined,
    exclusionPath: abs.exclusionPath || undefined,
    allowlistPath: abs.allowlistPath || undefined,
  });

  const base = join(repoRoot, "generated", serviceId);
  const schemaFiles = emitZodSchemas(ir, join(base, "schemas"));
  const httpFiles = emitHttpSuites(ir, join(base, "http"));
  const mcpFiles = emitMcpSuites(ir, join(base, "mcp"));
  return { ir, schemaFiles, httpFiles, mcpFiles };
}

export function repoRootFromUrl(metaUrl: string): string {
  return join(dirname(fileURLToPath(metaUrl)), "../..");
}
