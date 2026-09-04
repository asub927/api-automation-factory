import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  headersFromProfile,
  loadProfile,
  resolveProfilePath,
} from "../../src/auth/loadProfile.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Runtime auth header loader for generated suites.
 * Resolves profile by serviceId convention: support/profiles/<serviceId>.yaml
 */
export function loadAuthHeaders(serviceId: string): Record<string, string> {
  const profile = loadProfile(resolveProfilePath(root, serviceId));
  return headersFromProfile(profile);
}
