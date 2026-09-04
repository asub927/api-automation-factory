/**
 * Coverage IR v1 — sole inventory→emit boundary (KTD4).
 * Emit must refuse unknown major versions.
 */
export const COVERAGE_IR_VERSION = "coverage-ir/v1" as const;

export type MutationClass = "read" | "mutating" | "unknown";

export type DriftSeverity = "INFO" | "WARN" | "ERROR";

export interface DriftFinding {
  code: string;
  severity: DriftSeverity;
  toolName?: string;
  operationId?: string;
  message: string;
}

export interface UncoveredItem {
  kind: "unmapped" | "intentionally-uncovered" | "spring-missing";
  toolName?: string;
  operationId?: string;
  reason: string;
}

export interface Capability {
  id: string;
  toolName: string;
  httpMapped: boolean;
  method?: string;
  path?: string;
  operationId?: string;
  mutationClass: MutationClass;
  hasOpenApiEnrichment: boolean;
  inputSchema?: unknown;
  outputSchema?: unknown;
  openApiRequestSchema?: unknown;
  openApiResponseSchema?: unknown;
}

export interface CoverageIr {
  version: typeof COVERAGE_IR_VERSION | string;
  serviceId: string;
  openApiDigest?: string;
  openApiUri?: string;
  mcpDigest?: string;
  capabilities: Capability[];
  drift: DriftFinding[];
  uncovered: UncoveredItem[];
  intentionallyUncovered: UncoveredItem[];
}

export function assertSupportedIrVersion(version: string): void {
  const major = version.split("/")[1]?.split(".")[0];
  if (version !== COVERAGE_IR_VERSION && major !== "v1") {
    throw Object.assign(new Error(`unsupported coverage IR version: ${version}`), {
      failureClass: "setup" as const,
    });
  }
}
