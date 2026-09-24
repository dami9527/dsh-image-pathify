/**
 * Credentials wire used by the Vision card.
 *
 * 0.1.7 exposes credentials on `ctx.remote.credentials`: `describe([ref])`
 * and `set(ref, value)`.
 * @module dsh-image-pathify/client/credentials-api
 */

import type { VisionCredentialFace } from "./card-form.ts";

/** Minimal ctx face: `get` only, so this module does not import ClientContext. */
export interface CredentialsLookup {
  get(name: string): unknown;
}

interface CredentialsMethods {
  describe: (...args: never[]) => Promise<unknown>;
  set: (...args: never[]) => Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCredentialsMethods(value: unknown): value is CredentialsMethods {
  return (
    isRecord(value) &&
    typeof value.describe === "function" &&
    typeof value.set === "function"
  );
}

function viewOf(
  value: unknown,
): { configured: boolean; writable: boolean } | undefined {
  if (!isRecord(value)) return undefined;
  return {
    configured: value.configured === true,
    writable: value.writable !== false,
  };
}

/** The live `remote.credentials` methods, when the host has mounted them. */
export function resolveCredentialsApi(
  ctx: CredentialsLookup,
): CredentialsMethods | undefined {
  const nested = ctx.get("remote.credentials");
  if (isCredentialsMethods(nested)) return nested;
  const remote = ctx.get("remote");
  if (isRecord(remote) && isCredentialsMethods(remote.credentials)) {
    return remote.credentials;
  }
  return undefined;
}

function describeView(
  result: unknown,
  ref: string,
): { configured: boolean; writable: boolean } | undefined {
  if (!isRecord(result)) return undefined;
  const inner = isRecord(result.result) ? result.result : result;
  if (inner.ok === false) return { configured: false, writable: true };
  const value = inner.value;
  if (!isRecord(value)) return undefined;
  const bag = isRecord(value.credentials) ? value.credentials : value;
  return viewOf(bag[ref]);
}

function setRefused(result: unknown): boolean {
  if (!isRecord(result)) return false;
  const inner = isRecord(result.result) ? result.result : result;
  return inner.ok === false;
}

/**
 * Wrap the credentials namespace as the card's describe/set face.
 * @param api - live host methods, or undefined when the namespace is absent.
 */
export function credentialsFace(
  api: CredentialsMethods | undefined,
): VisionCredentialFace {
  return {
    async describe(ref) {
      if (api === undefined) return { configured: false, writable: true };
      const result = await api.describe([ref] as never);
      return describeView(result, ref) ?? { configured: false, writable: true };
    },
    async set(ref, value) {
      if (api === undefined) {
        throw new Error("the credentials API is not available");
      }
      const result = await api.set(ref as never, value as never);
      if (setRefused(result)) {
        throw new Error("credentials.set refused");
      }
    },
  };
}

/**
 * Credentials face that re-resolves the host source on every call, so a
 * late-arriving `remote.credentials` fiber is picked up without remounting
 * the card.
 */
export function liveCredentials(ctx: CredentialsLookup): VisionCredentialFace {
  return {
    describe(ref) {
      return credentialsFace(resolveCredentialsApi(ctx)).describe(ref);
    },
    set(ref, value) {
      return credentialsFace(resolveCredentialsApi(ctx)).set(ref, value);
    },
  };
}
