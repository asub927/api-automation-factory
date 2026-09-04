import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import YAML from "yaml";
import { z } from "zod";

const ProfileSchema = z.object({
  id: z.string(),
  type: z.enum(["api_key", "bearer", "basic", "oauth_client_credentials"]),
  headerName: z.string().optional(),
  env: z.object({
    token: z.string().regex(/^[A-Z0-9_]+$/).optional(),
    username: z.string().regex(/^[A-Z0-9_]+$/).optional(),
    password: z.string().regex(/^[A-Z0-9_]+$/).optional(),
    clientId: z.string().regex(/^[A-Z0-9_]+$/).optional(),
    clientSecret: z.string().regex(/^[A-Z0-9_]+$/).optional(),
    tokenUrl: z.string().regex(/^[A-Z0-9_]+$/).optional(),
  }),
});

export type AuthProfile = z.infer<typeof ProfileSchema>;

const VALUE_LIKE = /^(Bearer\s+|sk-|ghp_|xox[baprs]-)/i;

export class AuthError extends Error {
  readonly failureClass = "auth" as const;
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export function loadProfile(profilePath: string): AuthProfile {
  if (!existsSync(profilePath)) {
    throw new AuthError(`auth profile not found: ${profilePath}`);
  }
  const raw = YAML.parse(readFileSync(profilePath, "utf8"));
  // Reject value-like secret material in YAML (AE10)
  const dumped = JSON.stringify(raw);
  if (VALUE_LIKE.test(dumped) || /:\s*["']?[A-Za-z0-9_\-]{20,}["']?/.test(dumped) && /secret|token|password/i.test(dumped)) {
    // Heuristic: if a field looks like a long secret value rather than ENV_NAME
    for (const [k, v] of Object.entries((raw as { env?: Record<string, string> }).env ?? {})) {
      if (typeof v === "string" && !/^[A-Z0-9_]+$/.test(v)) {
        throw new AuthError(`auth profile must use env var names only (bad ${k})`);
      }
      if (typeof v === "string" && VALUE_LIKE.test(v)) {
        throw new AuthError(`auth profile contains value-like secret material`);
      }
    }
  }
  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AuthError(`invalid auth profile: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function resolveProfilePath(repoRoot: string, profileId: string): string {
  return resolve(repoRoot, `support/profiles/${profileId}.yaml`);
}

/** Build headers from env at runtime — never write resolved values into generated files. */
export function headersFromProfile(profile: AuthProfile, env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (profile.type === "api_key" || profile.type === "bearer") {
    const name = profile.env.token;
    if (!name) throw new AuthError("profile missing env.token");
    const value = env[name];
    if (!value) throw new AuthError(`missing required secret env: ${name}`);
    const header = profile.headerName ?? "Authorization";
    const headerValue =
      profile.type === "bearer" || header.toLowerCase() === "authorization"
        ? `Bearer ${value}`
        : value;
    return { [header]: headerValue };
  }
  if (profile.type === "basic") {
    const u = profile.env.username;
    const p = profile.env.password;
    if (!u || !p) throw new AuthError("basic profile requires env.username and env.password");
    const user = env[u];
    const pass = env[p];
    if (!user || !pass) throw new AuthError(`missing basic auth secrets`);
    return {
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
    };
  }
  throw new AuthError(`oauth_client_credentials runtime resolution deferred; provide bearer token env for v1`);
}
