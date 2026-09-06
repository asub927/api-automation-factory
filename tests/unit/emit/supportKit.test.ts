import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emitSupportKit,
  SUPPORT_KIT_FILES,
  SUPPORT_KIT_OWNED_MARKER,
} from "../../../src/emit/supportKit.js";
import { assertNoSecretsInGenerated } from "../../../src/emit/http.js";

describe("emitSupportKit (U3)", () => {
  it("writes overwrite-owned auth/expectZod/mcpClient kit files", () => {
    const root = mkdtempSync(join(tmpdir(), "support-kit-"));
    try {
      const supportRoot = join(root, "playwright/api/support");
      const result = emitSupportKit(supportRoot);
      expect(result.written).toHaveLength(SUPPORT_KIT_FILES.length);
      expect(result.skippedHandOwned).toEqual([]);
      for (const name of SUPPORT_KIT_FILES) {
        const path = join(supportRoot, name);
        expect(existsSync(path)).toBe(true);
        const body = readFileSync(path, "utf8");
        expect(body).toContain(SUPPORT_KIT_OWNED_MARKER);
        assertNoSecretsInGenerated(body, path);
      }
      expect(readFileSync(join(supportRoot, "auth.ts"), "utf8")).toContain("loadAuthHeaders");
      expect(readFileSync(join(supportRoot, "expectZod.ts"), "utf8")).toContain("expectZod");
      expect(readFileSync(join(supportRoot, "mcpClient.ts"), "utf8")).toContain("callMcpTool");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("regeneration overwrites kit files but not adjacent hand-owned files", () => {
    const root = mkdtempSync(join(tmpdir(), "support-kit-"));
    try {
      const supportRoot = join(root, "playwright/api/support");
      emitSupportKit(supportRoot);
      const handOwned = join(supportRoot, "teamHelpers.ts");
      writeFileSync(handOwned, "export const team = true;\n", "utf8");
      const kitPath = join(supportRoot, "auth.ts");
      writeFileSync(
        kitPath,
        `// ${SUPPORT_KIT_OWNED_MARKER}\nexport function loadAuthHeaders() { return { stale: true }; }\n`,
        "utf8",
      );

      const second = emitSupportKit(supportRoot);
      expect(second.written.some((p) => p.endsWith("auth.ts"))).toBe(true);
      expect(readFileSync(kitPath, "utf8")).toContain("missing required secret env");
      expect(readFileSync(kitPath, "utf8")).not.toContain("stale: true");
      expect(readFileSync(handOwned, "utf8")).toBe("export const team = true;\n");
      expect(second.skippedHandOwned).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips same-named hand-owned overrides that omit the owned banner", () => {
    const root = mkdtempSync(join(tmpdir(), "support-kit-"));
    try {
      const supportRoot = join(root, "playwright/api/support");
      mkdirSync(supportRoot, { recursive: true });
      const customAuth = join(supportRoot, "auth.ts");
      writeFileSync(customAuth, "export function loadAuthHeaders() { return { custom: '1' }; }\n");
      const result = emitSupportKit(supportRoot);
      expect(result.skippedHandOwned).toContain(customAuth);
      expect(readFileSync(customAuth, "utf8")).toContain("custom");
      expect(result.written.some((p) => p.endsWith("expectZod.ts"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("never embeds resolved secret values in kit sources", () => {
    const root = mkdtempSync(join(tmpdir(), "support-kit-"));
    try {
      const supportRoot = join(root, "playwright/api/support");
      emitSupportKit(supportRoot);
      for (const name of SUPPORT_KIT_FILES) {
        const body = readFileSync(join(supportRoot, name), "utf8");
        expect(body).not.toMatch(/Bearer\s+[A-Za-z0-9\-._~+/]{8,}/);
        expect(body).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
        expect(body).not.toContain("Authorization: Bearer ey");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
