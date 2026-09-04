import http from "node:http";

const PORT = Number(process.env.DEMO_PORT ?? 4099);

const orders = {
  "demo-1": { id: "demo-1", status: "pending" },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const orderMatch = /^\/orders\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && orderMatch) {
    const order = orders[orderMatch[1]];
    if (!order) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(order));
    return;
  }

  if (req.method === "POST" && url.pathname === "/mcp") {
    // Minimal JSON-RPC-ish stub for MCP tool calls used by fixture client
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const name = body.name ?? body.params?.name;
    if (name === "getOrderById") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          isError: false,
          structuredContent: orders["demo-1"],
        }),
      );
      return;
    }
    if (name === "listRecentOrders") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          isError: false,
          structuredContent: { id: "demo-1", status: "pending" },
        }),
      );
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ isError: true, content: { error: "unknown" } }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`demo fixture listening on http://127.0.0.1:${PORT}`);
});
