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
  /** Vision model id (default `deepseek-v4-flash-vision-exp`). */
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
  models: z
    .array(
      z.object({
        provider: z.string(),
        model: z.string(),
      }),
    )
    .default([]),
  /**
   * Install the `ctx.llm.resolveModelInfo` shim that makes host image
   * admission preflights admit text-only models. Disable when the harness
   * itself already relaxes those gates.
   */
  relaxAdmission: z.boolean().default(true),
  /** Credential reference resolved for each vision call. */
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULT_API_KEY_ENV),
  /** Vision model id (default `deepseek-v4-flash-vision-exp`). */
  visionModel: z.string().default(DEFAULT_VISION_MODEL),
  /** OpenAI-compatible vision base URL. */
  visionBaseUrl: z.string().default(DEFAULT_VISION_BASE_URL),
  /**
   * When true, DeepSeek-style endpoints get `thinking: { type: "disabled" }`.
   * Captioning does not need a chain of thought; uncheck to let the model think.
   */
  disableThinking: z.boolean().default(DEFAULT_DISABLE_THINKING),
  /**
   * `max_tokens` for a vision completion (one or many images). `0` omits
   * the field so the provider uses its own default cap.
   */
  maxTokens: z
    .number()
    .min(MIN_VISION_MAX_TOKENS)
    .max(MAX_VISION_MAX_TOKENS)
    .step(1)
    .default(DEFAULT_MAX_TOKENS),
});
