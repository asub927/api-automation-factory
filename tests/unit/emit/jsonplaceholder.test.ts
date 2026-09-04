import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { compileService } from "../../../src/emit/compile.js";
import { getPostResponseSchema } from "../../../generated/jsonplaceholder/schemas/getPost.schema.js";
import { expectZod } from "../../../support/fixtures/expectZod.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("jsonplaceholder dual-lane emit", () => {
  it("emits HTTP + MCP for getPost from OpenAPI+MCP tools", () => {
    const result = compileService(root, "jsonplaceholder");
    expect(result.httpFiles.some((f) => f.includes("getPost"))).toBe(true);
    expect(result.mcpFiles.some((f) => f.includes("getPost"))).toBe(true);
    expect(result.mcpFiles.some((f) => f.includes("deletePost"))).toBe(false);
    expect(
      result.ir.intentionallyUncovered.some(
        (u) => u.toolName === "deletePost" && u.reason === "mutation-not-allowlisted",
      ),
    ).toBe(true);
    const schema = readFileSync(
      join(root, "generated/jsonplaceholder/schemas/getPost.schema.ts"),
      "utf8",
    );
    expect(schema).toContain("z.object");
    expect(schema).toContain("title");
  });

  it("Zod rejects deliberate schema break (spike success criterion)", () => {
    expect(existsSync(join(root, "generated/jsonplaceholder/schemas/getPost.schema.ts"))).toBe(
      true,
    );
    const good = { userId: 1, id: 1, title: "t", body: "b" };
    expect(() => expectZod(getPostResponseSchema, good)).not.toThrow();
    const broken = { userId: "not-a-number", id: 1, title: "t", body: "b" };
    expect(() => expectZod(getPostResponseSchema, broken)).toThrow(/contract/);
  });
});
