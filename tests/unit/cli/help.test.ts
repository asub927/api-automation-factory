import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(root, "src/cli/index.ts");

function runFactory(args: string[]) {
  return spawnSync("npx", ["tsx", cli, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

describe("factory CLI help", () => {
  it("factory --help exits 0 and lists propose", () => {
    const result = runFactory(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("propose");
    expect(result.stdout).toMatch(/Usage: factory/i);
  });

  it("factory propose --help exits 0", () => {
    const result = runFactory(["propose", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--service");
    expect(result.stdout).toMatch(/never auto-merges/i);
  });

  it("unknown command exits 2 with stable error", () => {
    const result = runFactory(["not-a-command"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown command");
  });

  it("package scripts define test:unit and test:e2e", async () => {
    const { readFileSync } = await import("node:fs");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts["test:unit"]).toBeTruthy();
    expect(pkg.scripts["test:e2e"]).toBeTruthy();
  });
});
