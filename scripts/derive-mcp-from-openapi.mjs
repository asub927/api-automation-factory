#!/usr/bin/env node
/**
 * Derive MCP tool definitions from an OpenAPI lockfile using the same naming
 * strategy as openapi-to-mcp (operationId). Used to ground the compile path
 * when a live openapi-to-mcp / mcp-openapi process is not attached.
 *
 * Usage: node scripts/derive-mcp-from-openapi.mjs <openapi.yaml> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import YAML from "yaml";

const [,, openApiPath, outPath] = process.argv;
if (!openApiPath || !outPath) {
  console.error("Usage: derive-mcp-from-openapi.mjs <openapi.yaml> <out.json>");
  process.exit(64);
}

function resolveRef(schema, root, seen = new Set()) {
  if (!schema || typeof schema !== "object") return schema;
  if (typeof schema.$ref === "string" && schema.$ref.startsWith("#/")) {
    const ref = schema.$ref;
    if (seen.has(ref)) return { type: "object" };
    seen.add(ref);
    let cur = root;
    for (const p of ref.slice(2).split("/")) {
      if (!cur || typeof cur !== "object") return schema;
      cur = cur[p];
    }
    return resolveRef(cur, root, seen);
  }
  if (Array.isArray(schema)) return schema.map((s) => resolveRef(s, root, new Set(seen)));
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(
        Object.entries(v).map(([pk, pv]) => [pk, resolveRef(pv, root, new Set(seen))]),
      );
    } else if (k === "items") {
      out[k] = resolveRef(v, root, new Set(seen));
    } else {
      out[k] = v;
    }
  }
  return out;
}

const doc = YAML.parse(readFileSync(openApiPath, "utf8"));
const paths = doc.paths ?? {};
const tools = [];

for (const [path, pathItem] of Object.entries(paths)) {
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    const op = pathItem[method];
    if (!op) continue;
    const name = op["x-mcp-tool-name"] ?? op.operationId;
    if (!name || !/^[a-zA-Z0-9_-]{1,64}$/.test(name)) continue;

    const properties = {};
    const required = [];
    for (const p of [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]) {
      if (!p?.name) continue;
      properties[p.name] = p.schema ?? { type: "string" };
      if (p.required) required.push(p.name);
    }
    const bodySchemaRaw = op.requestBody?.content?.["application/json"]?.schema;
    const bodySchema = bodySchemaRaw ? resolveRef(bodySchemaRaw, doc) : undefined;
    if (bodySchema?.properties) {
      Object.assign(properties, bodySchema.properties);
      for (const r of bodySchema.required ?? Object.keys(bodySchema.properties)) {
        required.push(r);
      }
    }

    const readOnly = method === "get" || method === "head";
    tools.push({
      name,
      description:
        op["x-mcp-tool-description"] ??
        op.description ??
        op.summary ??
        `${method.toUpperCase()} ${path}`,
      annotations: readOnly
        ? { readOnlyHint: true }
        : { destructiveHint: method === "delete" },
      inputSchema: {
        type: "object",
        ...(required.length ? { required: [...new Set(required)] } : {}),
        properties,
      },
      // Bridge metadata for fixtures (not an MCP wire field)
      xFactoryHttp: { method: method.toUpperCase(), path },
    });
  }
}

tools.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  outPath,
  JSON.stringify(
    { tools, derivedFrom: openApiPath, naming: "operationId", bridge: "openapi-to-mcp-compatible" },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${tools.length} tools → ${outPath}`);
