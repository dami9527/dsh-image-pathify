/**
 * Plugin Config schema: pathify tunables plus the vision endpoint. Invalid
 * config fails at load. The same schema is the settings-namespace section.
 * @module dsh-image-pathify/config
 */

import z from "@deepseek-ai/schemastery";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_DISABLE_THINKING,
  DEFAULT_MAX_TOKENS,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
  MAX_VISION_MAX_TOKENS,
  MIN_VISION_MAX_TOKENS,
} from "./defaults.ts";

/**
 * Mark one field live-editable. 0.1.7 settings forms only project fields whose
 * `meta.volatile` is set. schemastery 3.18.4 `.volatile()` writes that flag
 * and returns a live ref; `.extra` remains for an older schema copy.
 */
function live<S>(schema: S): S {
  const candidate = schema as {
    volatile?: () => S;
    extra?: (key: string, value: boolean) => S;
  };
  if (typeof candidate.volatile === "function") return candidate.volatile();
  if (typeof candidate.extra === "function")
    return candidate.extra("volatile", true);
  return schema;
}

/** Tunables; invalid config fails at load. The interface names the schema's output shape. */
export interface Config {
  /**
   * Restrict host-admission relaxation to these exact provider/model pairs.
   * Empty (default) relaxes every model whose declared input modalities
   * exclude `image` while an attachment store is present.
   */
  models: readonly { provider: string; model: string }[];
  /**
   * Install the `ctx.llm.resolveModelInfo` shim that makes host image
   * admission preflights admit text-only models. Disable when the harness
   * itself already relaxes those gates.
   */
  relaxAdmission: boolean;
  /**
   * Credential reference resolved for each vision call. The literal is stored
   * by `ctx.credentials` (`$DSH_HOME/.credentials.yaml`), not in this section.
   */
  apiKeyEnv: string;
  /** Vision model id (default `deepseek-flash`). */
  visionModel: string;
  /** OpenAI-compatible vision base URL. */
  visionBaseUrl: string;
  /**
   * When true, DeepSeek-style endpoints get `thinking: { type: "disabled" }`.
   * Captioning does not need a chain of thought; uncheck to let the model think.
   */
  disableThinking: boolean;
  /**
   * `max_tokens` for a vision completion (one or many images). `0` omits
   * the field so the provider uses its own default cap.
   */
  maxTokens: number;
}

export const Config = z.object({
  /**
   * Restrict host-admission relaxation to these exact provider/model pairs.
   * Empty (default) relaxes every model whose declared input modalities
   * exclude `image` while an attachment store is present.
   */
  models: live(
    z
      .array(
        z.object({
          provider: z.string(),
          model: z.string(),
        }),
      )
      .default([]),
  ),
  /**
   * Install the `ctx.llm.resolveModelInfo` shim that makes host image
   * admission preflights admit text-only models. Disable when the harness
   * itself already relaxes those gates.
   */
  relaxAdmission: live(z.boolean().default(true)),
  /** Credential reference resolved for each vision call. */
  apiKeyEnv: live(
    z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  ),
  /** Vision model id (default `deepseek-flash`). */
  visionModel: live(z.string().default(DEFAULT_VISION_MODEL)),
  /** OpenAI-compatible vision base URL. */
  visionBaseUrl: live(z.string().default(DEFAULT_VISION_BASE_URL)),
  /**
   * When true, DeepSeek-style endpoints get `thinking: { type: "disabled" }`.
   * Captioning does not need a chain of thought; uncheck to let the model think.
   */
  disableThinking: live(z.boolean().default(DEFAULT_DISABLE_THINKING)),
  /**
   * `max_tokens` for a vision completion (one or many images). `0` omits
   * the field so the provider uses its own default cap.
   */
  maxTokens: live(
    z
      .number()
      .min(MIN_VISION_MAX_TOKENS)
      .max(MAX_VISION_MAX_TOKENS)
      .step(1)
      .default(DEFAULT_MAX_TOKENS),
  ),
});

/**
 * The schemastery copy bundled with this plugin records `meta.volatile` but
 * does not turn those fields into live refs. 0.1.7 then treats a plugins-page
 * save as volatile-only, skips remounting, and keeps serving the old snapshot,
 * so the form snaps back to the defaults. Wrap the standard validator so each
 * volatile field is a ref the loader can update in place.
 */
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

function isVolatileRef(value: unknown): boolean {
  return typeof value === "object" && value !== null && VOLATILE_WRITE in value;
}

function volatileRef(value: unknown): { get(): unknown } {
  let current = value;
  return Object.freeze({
    get: () => current,
    [VOLATILE_WRITE](next: unknown) {
      current = next;
    },
  });
}

interface VolatileSchema {
  meta?: { volatile?: boolean };
  type?: string;
  dict?: Record<string, VolatileSchema>;
}

function wrapVolatileFields(schema: VolatileSchema, value: unknown): unknown {
  if (schema.meta?.volatile) {
    return isVolatileRef(value) ? value : volatileRef(value);
  }
  if (
    schema.type === "object" &&
    schema.dict !== undefined &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const record = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = { ...record };
    for (const [key, child] of Object.entries(schema.dict)) {
      if (!Object.hasOwn(record, key)) continue;
      const wrapped = wrapVolatileFields(child, record[key]);
      if (wrapped !== record[key]) {
        next[key] = wrapped;
        changed = true;
      }
    }
    return changed ? next : value;
  }
  return value;
}

const standard = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Config),
  "~standard",
);
if (standard?.get !== undefined) {
  Object.defineProperty(Config, "~standard", {
    configurable: true,
    get() {
      const face = standard.get!.call(this) as {
        validate: (value: unknown) => { value?: unknown; issues?: unknown };
      };
      return {
        ...face,
        validate: (value: unknown) => {
          const result = face.validate(value);
          if (result.issues !== undefined || !("value" in result))
            return result;
          return { value: wrapVolatileFields(this, result.value) };
        },
      };
    },
  });
}
