import { describe, expect, it } from "vitest";
import { callDemoMcpTool } from "../../../support/fixtures/mcpClient.js";

describe("mcpClient transport", () => {
  it("classifies unreachable fixture as transport, not contract", async () => {
    const prev = process.env.DEMO_BASE_URL;
    process.env.DEMO_BASE_URL = "http://127.0.0.1:19999";
    try {
      await expect(callDemoMcpTool("getOrderById")).rejects.toMatchObject({
        failureClass: "transport",
      });
    } finally {
      if (prev === undefined) delete process.env.DEMO_BASE_URL;
      else process.env.DEMO_BASE_URL = prev;
    }
  });
});
