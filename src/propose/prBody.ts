import type { CoverageIr } from "../inventory/ir.js";

export interface ProposeReport {
  serviceId: string;
  generatorVersion: string;
  openApiDigest?: string;
  openApiUri?: string;
  mcpDigest?: string;
  irHash: string;
  coverage: {
    capabilities: number;
    httpMapped: number;
    mcpLive: number;
  };
  drift: CoverageIr["drift"];
  uncovered: CoverageIr["uncovered"];
  intentionallyUncovered: CoverageIr["intentionallyUncovered"];
}

export function buildProposeReport(
  ir: CoverageIr,
  opts: { generatorVersion: string; irHash: string },
): ProposeReport {
  return {
    serviceId: ir.serviceId,
    generatorVersion: opts.generatorVersion,
    openApiDigest: ir.openApiDigest,
    openApiUri: ir.openApiUri,
    mcpDigest: ir.mcpDigest,
    irHash: opts.irHash,
    coverage: {
      capabilities: ir.capabilities.length,
      httpMapped: ir.capabilities.filter((c) => c.httpMapped).length,
      mcpLive: ir.capabilities.length - ir.intentionallyUncovered.filter((u) => u.reason === "mutation-not-allowlisted").length,
    },
    drift: ir.drift,
    uncovered: ir.uncovered,
    intentionallyUncovered: ir.intentionallyUncovered,
  };
}

export function renderPrBody(report: ProposeReport): string {
  const lines: string[] = [
    `<!-- factory-generated service=${report.serviceId} ir=${report.irHash} -->`,
    `# Factory propose: \`${report.serviceId}\``,
    "",
    "Draft PR opened by **api-automation-factory**. Human review required — **never auto-merged**.",
    "",
    "## Coverage",
    "",
    `- Capabilities: ${report.coverage.capabilities}`,
    `- HTTP-mapped: ${report.coverage.httpMapped}`,
    `- Generator: ${report.generatorVersion}`,
    `- OpenAPI digest: \`${report.openApiDigest ?? "n/a"}\``,
    `- MCP digest: \`${report.mcpDigest ?? "n/a"}\``,
    `- IR hash: \`${report.irHash}\``,
    "",
    "## Drift",
    "",
  ];

  if (report.drift.length === 0) {
    lines.push("_None_");
  } else {
    for (const d of report.drift) {
      lines.push(
        `- **${d.severity}** \`${d.code}\` ${d.toolName ?? d.operationId ?? ""} — ${d.message}`,
      );
    }
  }

  lines.push("", "## Uncovered", "");
  if (report.uncovered.length === 0) {
    lines.push("_None_");
  } else {
    for (const u of report.uncovered) {
      lines.push(`- \`${u.toolName ?? u.operationId}\` (${u.kind}) — ${u.reason}`);
    }
  }

  lines.push("", "## Intentionally uncovered", "");
  if (report.intentionallyUncovered.length === 0) {
    lines.push("_None_");
  } else {
    for (const u of report.intentionallyUncovered) {
      lines.push(`- \`${u.toolName}\` — ${u.reason}`);
    }
  }

  lines.push(
    "",
    "## Review checklist",
    "",
    "- [ ] Drift classifications look correct",
    "- [ ] Allowlist/exclusion deltas are intentional",
    "- [ ] Host/env targets remain non-prod",
    "- [ ] No secrets in generated diffs",
    "",
  );

  const body = lines.join("\n");
  if (/(Authorization\s*:)|(Bearer\s+[A-Za-z0-9\-._~+/]+=*)|(sk-[A-Za-z0-9]{10,})/i.test(body)) {
    throw Object.assign(new Error("secret-like material in PR body"), {
      failureClass: "setup" as const,
    });
  }
  return body;
}
