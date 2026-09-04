/**
 * Demo MCP client fixture. U6 wires a real fixture server;
 * until then this provides a deterministic in-process stub for unit/smoke paths.
 */
export async function callDemoMcpTool(
  name: string,
  _args: Record<string, unknown>,
): Promise<{ isError: boolean; structuredContent?: unknown; content?: unknown }> {
  if (name === "getOrderById") {
    return {
      isError: false,
      structuredContent: { id: "demo-1", status: "pending" },
    };
  }
  if (name === "listRecentOrders") {
    return {
      isError: false,
      structuredContent: { id: "demo-1", status: "pending" },
    };
  }
  return { isError: true, content: { error: `unknown tool ${name}` } };
}
