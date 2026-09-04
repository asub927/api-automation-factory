/**
 * MCP client fixtures for generated suites.
 * - demo: local fixtures/demo-service
 * - jsonplaceholder: OpenAPI→MCP bridge over the public HTTP API
 *   (same operationId naming as openapi-to-mcp / mcp-openapi)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export type McpCallResult = {
  isError: boolean;
  structuredContent?: unknown;
  content?: unknown;
};

/** @deprecated prefer callMcpTool(serviceId, ...) */
export async function callDemoMcpTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpCallResult> {
  return callMcpTool("demo", name, args);
}

export async function callMcpTool(
  serviceId: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpCallResult> {
  if (serviceId === "demo") {
    return callDemoFixture(name, args);
  }
  if (serviceId === "jsonplaceholder") {
    return callJsonPlaceholderBridge(name, args);
  }
  throw Object.assign(new Error(`setup: unknown MCP service ${serviceId}`), {
    failureClass: "setup" as const,
  });
}

async function callDemoFixture(
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const base = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:4099";
  let response: Response;
  try {
    response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
  } catch (err) {
    throw Object.assign(
      new Error(
        `transport: MCP fixture unreachable at ${base}/mcp: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { failureClass: "transport" as const },
    );
  }
  if (!response.ok) {
    throw Object.assign(
      new Error(`transport: MCP fixture HTTP ${response.status}`),
      { failureClass: "transport" as const },
    );
  }
  return (await response.json()) as McpCallResult;
}

type ToolMeta = {
  name: string;
  xFactoryHttp?: { method: string; path: string };
};

function loadJpTools(): ToolMeta[] {
  const path = join(root, "contracts/jsonplaceholder/mcp-tools.json");
  if (!existsSync(path)) return [];
  const doc = JSON.parse(readFileSync(path, "utf8")) as { tools: ToolMeta[] };
  return doc.tools ?? [];
}

/**
 * Live MCP lane for JSONPlaceholder: bridge tool call → HTTP using
 * xFactoryHttp metadata derived alongside openapi-to-mcp naming.
 */
async function callJsonPlaceholderBridge(
  name: string,
  args: Record<string, unknown>,
): Promise<McpCallResult> {
  const base =
    process.env.JSONPLACEHOLDER_BASE_URL ?? "https://jsonplaceholder.typicode.com";
  const tool = loadJpTools().find((t) => t.name === name);
  if (!tool?.xFactoryHttp) {
    return { isError: true, content: { error: `unknown tool ${name}` } };
  }
  let path = tool.xFactoryHttp.path;
  const query: string[] = [];
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (path.includes(`{${k}}`)) {
      path = path.replace(`{${k}}`, encodeURIComponent(String(v)));
    } else if (tool.xFactoryHttp.method === "GET") {
      query.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    } else {
      body[k] = v;
    }
  }
  // leftover unresolved path params
  path = path.replace(/\{[^}]+\}/g, "1");
  const url =
    query.length > 0 ? `${base}${path}?${query.join("&")}` : `${base}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: tool.xFactoryHttp.method,
      headers: { "content-type": "application/json", accept: "application/json" },
      body:
        tool.xFactoryHttp.method === "GET" || tool.xFactoryHttp.method === "DELETE"
          ? undefined
          : JSON.stringify(body),
    });
  } catch (err) {
    throw Object.assign(
      new Error(
        `transport: JSONPlaceholder unreachable: ${err instanceof Error ? err.message : String(err)}`,
      ),
      { failureClass: "transport" as const },
    );
  }
  if (!response.ok) {
    return {
      isError: true,
      content: { status: response.status, body: await response.text() },
    };
  }
  const structuredContent: unknown = await response.json();
  return { isError: false, structuredContent };
}
