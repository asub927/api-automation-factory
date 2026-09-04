import { readFileSync, existsSync } from "node:fs";
import YAML from "yaml";
import { sha256Hex, SetupError } from "../inventory/manifest.js";

export interface OpenApiOperation {
  operationId?: string;
  method: string;
  path: string;
  requestSchema?: unknown;
  responseSchema?: unknown;
  summary?: string;
}

export interface OpenApiInventory {
  operations: OpenApiOperation[];
  digest: string;
  uri: string;
  raw: unknown;
}

function methodsOf(pathItem: Record<string, unknown>): string[] {
  return ["get", "post", "put", "patch", "delete", "head", "options"].filter(
    (m) => m in pathItem,
  );
}

export function ingestOpenApi(opts: {
  mode: "lockfile" | "fetch";
  path?: string;
  url?: string;
}): OpenApiInventory {
  if (opts.mode === "fetch") {
    // v1: lockfile preferred; fetch requires network and is gated by egress in manifest load.
    // Implementers may enable later; for now fail closed to keep compile offline-first.
    throw new SetupError(
      "openApi.mode=fetch is not enabled in v1; commit a lockfile under contracts/<service>/",
    );
  }
  if (!opts.path || !existsSync(opts.path)) {
    throw new SetupError(`OpenAPI lockfile not found: ${opts.path ?? "(missing path)"}`);
  }
  const text = readFileSync(opts.path, "utf8");
  const raw = opts.path.endsWith(".json") ? JSON.parse(text) : YAML.parse(text);
  const paths = (raw as { paths?: Record<string, Record<string, unknown>> }).paths ?? {};
  const operations: OpenApiOperation[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of methodsOf(pathItem)) {
      const op = pathItem[method] as {
        operationId?: string;
        summary?: string;
        requestBody?: { content?: Record<string, { schema?: unknown }> };
        responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>;
      };
      const requestSchema =
        op.requestBody?.content?.["application/json"]?.schema ??
        op.requestBody?.content?.["application/*+json"]?.schema;
      const ok =
        op.responses?.["200"] ?? op.responses?.["201"] ?? op.responses?.default;
      const responseSchema =
        ok?.content?.["application/json"]?.schema ??
        ok?.content?.["application/*+json"]?.schema;
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        requestSchema,
        responseSchema,
        summary: op.summary,
      });
    }
  }

  operations.sort((a, b) => {
    const ak = `${a.method} ${a.path} ${a.operationId ?? ""}`;
    const bk = `${b.method} ${b.path} ${b.operationId ?? ""}`;
    return ak.localeCompare(bk);
  });

  return {
    operations,
    digest: sha256Hex(text),
    uri: opts.path,
    raw,
  };
}
