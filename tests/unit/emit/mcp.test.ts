import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileService } from "../../../src/emit/compile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("mcp emit", () => {
  it("emits MCP lane for read tools including unmapped (AE5)", () => {
    const result = compileService(root, "demo");
    expect(result.mcpFiles.some((f) => f.includes("listRecentOrders"))).toBe(true);
    expect(result.httpFiles.some((f) => f.includes("listRecentOrders"))).toBe(false);
  });
});
