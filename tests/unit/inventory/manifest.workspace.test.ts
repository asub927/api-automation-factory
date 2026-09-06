import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadManifest, SetupError } from "../../../src/inventory/manifest.js";

function writeTempManifest(body: string): { root: string; path: string } {
  const root = mkdtempSync(join(tmpdir(), "factory-manifest-"));
  mkdirSync(join(root, "support"), { recursive: true });
  writeFileSync(
    join(root, "support/egress-allowlist.yaml"),
    "hosts:\n  - localhost\n  - 127.0.0.1\n",
    "utf8",
  );
  const path = join(root, "service.manifest.yaml");
  writeFileSync(path, body, "utf8");
  return { root, path };
}

const baseFields = `
serviceId: billing
baseUrl: http://127.0.0.1:4099
authProfileId: billing
openApi:
  mode: lockfile
  path: openapi.yaml
mcp:
  path: mcp-tools.json
  transport: in-memory
`;

describe("manifest workspace target (U1)", () => {
  it("loads workspace.repo and exposes it on the manifest", () => {
    const { root, path } = writeTempManifest(`${baseFields}
workspace:
  repo: acme/billing-app
  defaultBranch: main
`);
    const { manifest } = loadManifest(path, root);
    expect(manifest.workspace?.repo).toBe("acme/billing-app");
    expect(manifest.workspace?.defaultBranch).toBe("main");
    expect(manifest.workspace?.mode).not.toBe("fixture");
  });

  it("allows fixture mode without workspace.repo", () => {
    const { root, path } = writeTempManifest(`${baseFields}
workspace:
  mode: fixture
`);
    const { manifest } = loadManifest(path, root);
    expect(manifest.workspace?.mode).toBe("fixture");
    expect(manifest.workspace?.repo).toBeUndefined();
  });

  it("rejects non-fixture manifests missing workspace.repo", () => {
    const { root, path } = writeTempManifest(baseFields);
    expect(() => loadManifest(path, root)).toThrow(SetupError);
    expect(() => loadManifest(path, root)).toThrow(/workspace\.repo/);
  });
});
