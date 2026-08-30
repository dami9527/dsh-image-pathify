/**
 * Credentials wire used by the Vision card.
 *
 * 0.1.2-alpha.1 moved the browser credentials API off `connection.api` onto
 * `ctx.remote.credentials` (and changed the call shape). Older hosts still
 * expose the RPC bag on `connection.api.credentials`. This module speaks both
 * and never reads `.credentials` off a missing `api`.
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

/** Where the live credentials methods were found. */
export type CredentialsSource =
  | { kind: "remote"; api: CredentialsMethods }
  | { kind: "legacy"; api: CredentialsMethods };

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

/**
 * Pick the credentials methods for this host.
 *
 * Prefer the 0.1.2 Remote namespace; fall back to the older Connection RPC
 * bag. `connection.api` is optional-chained: 0.1.2 still provides `connection`
 * but no longer mounts `api` on it.
 */
export function resolveCredentialsSource(
  ctx: CredentialsLookup,
): CredentialsSource | undefined {
  const nested = ctx.get("remote.credentials");
  if (isCredentialsMethods(nested)) return { kind: "remote", api: nested };
  const remote = ctx.get("remote");
  if (isRecord(remote) && isCredentialsMethods(remote.credentials)) {
    return { kind: "remote", api: remote.credentials };
  }
  const connection = ctx.get("connection");
  if (!isRecord(connection) || !isRecord(connection.api)) return undefined;
  return isCredentialsMethods(connection.api.credentials)
    ? { kind: "legacy", api: connection.api.credentials }
    : undefined;
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
 * Wrap one credentials source as the card's describe/set face.
 * @param source - live host methods, or undefined when neither wire exists.
 */
export function credentialsFace(
  source: CredentialsSource | undefined,
): VisionCredentialFace {
  return {
    async describe(ref) {
      if (source === undefined) return { configured: false, writable: true };
      const result =
        source.kind === "remote"
          ? await source.api.describe([ref] as never)
          : await source.api.describe({ refs: [ref] } as never);
      return describeView(result, ref) ?? { configured: false, writable: true };
    },
    async set(ref, value) {
      if (source === undefined) {
        throw new Error("the credentials API is not available");
      }
      const result =
        source.kind === "remote"
          ? await source.api.set(ref as never, value as never)
          : await source.api.set({ ref, value } as never);
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
      return credentialsFace(resolveCredentialsSource(ctx)).describe(ref);
    },
    set(ref, value) {
      return credentialsFace(resolveCredentialsSource(ctx)).set(ref, value);
    },
  };
}
