import { describe, expect, it, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { compileService } from "../../../src/emit/compile.js";
import { expectZod } from "../../../support/fixtures/expectZod.js";
import type { z } from "zod";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("jsonplaceholder dual-lane emit (contracts sample, not factory suite home)", () => {
  let getPostResponseSchema: z.ZodType;

  beforeAll(async () => {
    // Emit into generated/ for the sample — gitignored; not a production suite home (R12).
    compileService(root, "jsonplaceholder");
    const mod = await import(
      pathToFileURL(join(root, "generated/jsonplaceholder/schemas/getPost.schema.ts")).href
    );
    getPostResponseSchema = mod.getPostResponseSchema as z.ZodType;
  });

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
