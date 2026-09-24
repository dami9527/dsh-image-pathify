/**
 * Read the Loader-resolved Config, including 0.1.7 volatile field refs.
 * The host keeps those refs stable and writes new snapshots in place.
 * @module dsh-image-pathify/live
 */

import { Config, type Config as ConfigShape } from "./config.ts";

/** Shared with `@deepseek-ai/cosmokit` `isVolatile`, without taking that dependency. */
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

const FIELDS = [
  "models",
  "relaxAdmission",
  "apiKeyEnv",
  "visionModel",
  "visionBaseUrl",
  "disableThinking",
  "maxTokens",
] as const;

function isVolatileRef(value: unknown): value is { get(): unknown } {
  return typeof value === "object" && value !== null && VOLATILE_WRITE in value;
}

function unwrap(value: unknown): unknown {
  return isVolatileRef(value) ? value.get() : value;
}

function plainFields(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (!FIELDS.some((field) => isVolatileRef(record[field]))) return undefined;
  const plain: Record<string, unknown> = {};
  for (const field of FIELDS) plain[field] = unwrap(record[field]);
  return plain;
}

/**
 * Snapshot the live config. 3.18.4 `.volatile()` and the loader both store
 * field refs; this returns the plain values callers compare and send.
 */
export function readConfig(input: unknown): ConfigShape {
  const source = plainFields(input) ?? input ?? {};
  const parsed = Config(source as never);
  return (plainFields(parsed) ?? parsed) as ConfigShape;
}
