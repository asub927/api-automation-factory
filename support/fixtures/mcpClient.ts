/**
 * Demo MCP client fixture — calls the local fixture service over HTTP so the
 * demo-mcp Playwright lane proves against fixtures/demo-service (U6 / AE1).
 */
export async function callDemoMcpTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; structuredContent?: unknown; content?: unknown }> {
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

  return (await response.json()) as {
    isError: boolean;
    structuredContent?: unknown;
    content?: unknown;
  };
}
