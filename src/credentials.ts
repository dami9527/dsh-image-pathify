/**
 * Vision API key lives in the credentials store (`$DSH_HOME/.credentials.yaml`),
 * addressed by `apiKeyEnv`. Settings never carry the literal.
 * @module dsh-image-pathify/credentials
 */

import type { Context } from "@deepseek-ai/cordis";
import { DEFAULT_API_KEY_ENV } from "./defaults.ts";

const REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Host credentials seam used without a hard dependency on dsh-credentials. */
interface CredentialsSeam {
  resolve(ref: string): Promise<{ value: string } | undefined>;
}

/**
 * Brand a settings `apiKeyEnv` value as a credential reference. Invalid names
 * fall back to the plugin default so a typo cannot crash plugin load.
 */
export function credentialRefName(value: string): string {
  const trimmed = value.trim();
  return REF_PATTERN.test(trimmed) ? trimmed : DEFAULT_API_KEY_ENV;
}

/**
 * Resolve the vision bearer token for one call. Credentials first, then the
 * process environment.
 */
export async function resolveVisionApiKey(
  ctx: Context,
  apiKeyEnv: string,
): Promise<string> {
  const ref = credentialRefName(apiKeyEnv);
  const credentials = ctx.get("credentials") as CredentialsSeam | undefined;
  if (credentials !== undefined) {
    const hit = await credentials.resolve(ref);
    if (hit !== undefined && hit.value.length > 0) return hit.value;
  }
  const ambient = process.env[ref];
  return ambient !== undefined && ambient.length > 0 ? ambient : "";
}
