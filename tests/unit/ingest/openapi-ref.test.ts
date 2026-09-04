import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestOpenApi } from "../../../src/ingest/openapi.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("openapi $ref resolve", () => {
  it("inlines Post schema for jsonplaceholder getPost", () => {
    const inv = ingestOpenApi({
      mode: "lockfile",
      path: join(root, "contracts/jsonplaceholder/openapi.yaml"),
    });
    const get = inv.operations.find((o) => o.operationId === "getPost");
    expect(get?.responseSchema).toMatchObject({
      type: "object",
      properties: { id: { type: "integer" }, title: { type: "string" } },
    });
  });
});
