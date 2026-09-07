import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestMcp } from "../ingest/mcp.js";
import { ingestOpenApi } from "../ingest/openapi.js";
import { mergeInventory } from "../inventory/merge.js";
import { loadManifest } from "../inventory/manifest.js";
import { emitZodSchemas } from "./zod.js";
import { emitHttpSuites, emitMcpSuites, resetEmitRoot } from "./http.js";

export interface CompileOptions {
  /** Absolute emit root for this service (defaults to generated/<serviceId>). */
  emitRoot?: string;
  /**
   * Import base for support helpers from tests/ (no trailing slash).
   * Fixture default: ../../../support/fixtures
   * Workspace kit: ../../support
   */
  supportImportBase?: string;
}

export interface CompileResult {
  ir: ReturnType<typeof mergeInventory>;
  schemaFiles: string[];
  httpFiles: string[];
  mcpFiles: string[];
  emitRoot: string;
}

export function compileService(
  repoRoot: string,
  serviceId: string,
  opts: CompileOptions = {},
): CompileResult {
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

  const emitRoot = opts.emitRoot ?? join(repoRoot, "generated", serviceId);
  resetEmitRoot(emitRoot);
  const schemaFiles = emitZodSchemas(ir, join(emitRoot, "schemas"));
  const testsDir = join(emitRoot, "tests");
  const suiteOpts = { supportImportBase: opts.supportImportBase };
  const httpFiles = emitHttpSuites(ir, testsDir, suiteOpts);
  const mcpFiles = emitMcpSuites(ir, testsDir, suiteOpts);
  return { ir, schemaFiles, httpFiles, mcpFiles, emitRoot };
}

export function repoRootFromUrl(metaUrl: string): string {
  return join(dirname(fileURLToPath(metaUrl)), "../..");
}
