import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  headersFromProfile,
  loadProfile,
  resolveProfilePath,
  AuthError,
} from "../../src/auth/loadProfile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Runtime auth header loader for generated suites.
 * Resolves profile by serviceId convention: support/profiles/<serviceId>.yaml
 * Missing secrets throw AuthError (failureClass: auth) — never contract.
 */
export function loadAuthHeaders(serviceId: string): Record<string, string> {
  try {
    const profile = loadProfile(resolveProfilePath(root, serviceId));
    return headersFromProfile(profile);
  } catch (err) {
    if (err instanceof AuthError) {
      throw Object.assign(new Error(`auth: ${err.message}`), {
        failureClass: "auth" as const,
        name: "AuthError",
      });
    }
    throw err;
  }
}
