import { readFileSync, existsSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import YAML from "yaml";
import { z } from "zod";

const EnvName = z
  .string()
  .regex(/^[A-Z0-9_]+$/, "env var names must match ^[A-Z0-9_]+$");

const OpenApiSourceSchema = z.object({
  mode: z.enum(["lockfile", "fetch"]),
  path: z.string().optional(),
  url: z.string().url().optional(),
  ref: z.string().optional(),
});

const McpSourceSchema = z.object({
  path: z.string(),
  transport: z.enum(["stdio", "sse", "streamable-http", "in-memory"]).default("in-memory"),
  url: z.string().optional(),
  command: z.string().optional(),
});

const ManifestSchema = z.object({
  serviceId: z.string().min(1),
  baseUrl: z.string().url(),
  mcpEndpoint: z.string().optional(),
  authProfileId: z.string().min(1),
  openApi: OpenApiSourceSchema,
  mcp: McpSourceSchema,
  mappingPath: z.string().optional(),
  exclusionPath: z.string().optional(),
  allowlistPath: z.string().optional(),
});

export type ServiceManifest = z.infer<typeof ManifestSchema>;

export class SetupError extends Error {
  readonly failureClass = "setup" as const;
  constructor(message: string) {
    super(message);
    this.name = "SetupError";
  }
}

export function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function loadEgressAllowlist(repoRoot: string): string[] {
  const path = resolve(repoRoot, "support/egress-allowlist.yaml");
  if (!existsSync(path)) {
    return ["localhost", "127.0.0.1", "[::1]"];
  }
  const doc = YAML.parse(readFileSync(path, "utf8")) as { hosts?: string[] };
  return doc.hosts ?? [];
}

function hostOf(urlString: string): string {
  try {
    return new URL(urlString).hostname;
  } catch {
    throw new SetupError(`invalid URL: ${urlString}`);
  }
}

function isPrivateOrMetadataHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    return false; // allowed as fixture
  }
  if (hostname.endsWith(".local")) return true;
  if (hostname === "metadata.google.internal") return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return false; // loopback handled above; treat other 127 as private
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export function assertEgressAllowed(
  urlString: string,
  allowlist: string[],
  opts: { allowHttpLocalhost?: boolean } = {},
): void {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SetupError(`invalid URL for egress check: ${urlString}`);
  }

  const host = url.hostname;
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  if (url.protocol !== "https:" && !(opts.allowHttpLocalhost && isLocal && url.protocol === "http:")) {
    throw new SetupError(`egress denied: only https allowed (except localhost http fixtures): ${urlString}`);
  }

  if (isPrivateOrMetadataHost(host) && !isLocal) {
    throw new SetupError(`egress denied: private/metadata host: ${host}`);
  }

  const allowed = allowlist.some(
    (pattern) => host === pattern || host.endsWith(`.${pattern}`),
  );
  if (!allowed) {
    throw new SetupError(`egress denied: host '${host}' not in allowlist`);
  }
}

export function loadManifest(
  manifestPath: string,
  repoRoot: string,
): { manifest: ServiceManifest; abs: Record<string, string> } {
  if (!existsSync(manifestPath)) {
    throw new SetupError(`manifest not found: ${manifestPath}`);
  }
  const raw = YAML.parse(readFileSync(manifestPath, "utf8"));
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SetupError(`invalid manifest: ${parsed.error.message}`);
  }
  const manifest = parsed.data;

  const allowlist = loadEgressAllowlist(repoRoot);
  assertEgressAllowed(manifest.baseUrl, allowlist, { allowHttpLocalhost: true });
  if (manifest.mcpEndpoint) {
    assertEgressAllowed(manifest.mcpEndpoint, allowlist, { allowHttpLocalhost: true });
  }
  if (manifest.openApi.mode === "fetch") {
    if (!manifest.openApi.url) {
      throw new SetupError("openApi.mode=fetch requires url");
    }
    assertEgressAllowed(manifest.openApi.url, allowlist, { allowHttpLocalhost: true });
  }

  const resolvePath = (p?: string) => {
    if (!p) return undefined;
    return isAbsolute(p) ? p : resolve(repoRoot, p);
  };

  return {
    manifest,
    abs: {
      openApiPath: resolvePath(manifest.openApi.path) ?? "",
      mcpPath: resolvePath(manifest.mcp.path) ?? "",
      mappingPath: resolvePath(manifest.mappingPath) ?? "",
      exclusionPath: resolvePath(manifest.exclusionPath) ?? "",
      allowlistPath: resolvePath(manifest.allowlistPath) ?? "",
    },
  };
}

export { EnvName };
