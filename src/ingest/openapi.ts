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

/** Resolve local #/components/... refs (enough for Zod emit on lockfiles). */
export function resolveRef(schema: unknown, root: unknown, seen = new Set<string>()): unknown {
  if (!schema || typeof schema !== "object") return schema;
  const obj = schema as Record<string, unknown>;
  if (typeof obj.$ref === "string") {
    const ref = obj.$ref;
    if (!ref.startsWith("#/")) return schema;
    if (seen.has(ref)) return { type: "object" };
    seen.add(ref);
    const parts = ref.slice(2).split("/");
    let cur: unknown = root;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return schema;
      cur = (cur as Record<string, unknown>)[p];
    }
    return resolveRef(cur, root, seen);
  }
  if (Array.isArray(schema)) {
    return schema.map((s) => resolveRef(s, root, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [
          pk,
          resolveRef(pv, root, new Set(seen)),
        ]),
      );
    } else if (k === "items" || k === "additionalProperties") {
      out[k] = resolveRef(v, root, new Set(seen));
    } else if (k === "oneOf" || k === "anyOf" || k === "allOf") {
      out[k] = Array.isArray(v)
        ? v.map((s) => resolveRef(s, root, new Set(seen)))
        : v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function ingestOpenApi(opts: {
  mode: "lockfile" | "fetch";
  path?: string;
  url?: string;
}): OpenApiInventory {
  if (opts.mode === "fetch") {
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
      const requestSchemaRaw =
        op.requestBody?.content?.["application/json"]?.schema ??
        op.requestBody?.content?.["application/*+json"]?.schema;
      const ok =
        op.responses?.["200"] ?? op.responses?.["201"] ?? op.responses?.default;
      const responseSchemaRaw =
        ok?.content?.["application/json"]?.schema ??
        ok?.content?.["application/*+json"]?.schema;
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        requestSchema: requestSchemaRaw
          ? resolveRef(requestSchemaRaw, raw)
          : undefined,
        responseSchema: responseSchemaRaw
          ? resolveRef(responseSchemaRaw, raw)
          : undefined,
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
