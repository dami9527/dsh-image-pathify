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
  return (
    typeof value === "object" && value !== null && VOLATILE_WRITE in value
  );
}

function unwrap(value: unknown): unknown {
  return isVolatileRef(value) ? value.get() : value;
}

/**
 * Snapshot the live config. Plain objects (unit tests, and hosts whose
 * schemastery has no volatile fields) are parsed through the schema.
 */
export function readConfig(input: unknown): ConfigShape {
  if (typeof input === "object" && input !== null) {
    const record = input as Record<string, unknown>;
    if (FIELDS.some((field) => isVolatileRef(record[field]))) {
      const plain: Record<string, unknown> = {};
      for (const field of FIELDS) plain[field] = unwrap(record[field]);
      return Config(plain as never) as ConfigShape;
    }
  }
  return Config((input ?? {}) as never) as ConfigShape;
}
