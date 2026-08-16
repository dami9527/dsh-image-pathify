/**
 * Plugin Config schema: pathify tunables plus the vision endpoint. Invalid
 * config fails at load. The same schema is the settings-namespace section.
 * @module dsh-image-pathify/config
 */

import z from "@deepseek-ai/schemastery";
import {
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "./defaults.ts";

/** Tunables; invalid config fails at load. The interface names the schema's output shape. */
export interface Config {
  /** Text placed before each durable path in the rewritten text block. */
  prefix: string;
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
  /** Vision API bearer token. Empty until the user fills Settings → Plugins → Vision. */
  apiKey: string;
  /** Vision model id (default `qwen-vl-plus`). */
  visionModel: string;
  /** OpenAI-compatible vision base URL. */
  visionBaseUrl: string;
}

export const Config = z.object({
  /** Text placed before each durable path in the rewritten text block. */
  prefix: z.string().default(DEFAULT_PREFIX),
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
  /** Vision API bearer token. Empty until the user fills Settings → Plugins → Vision. */
  apiKey: z.string().role("secret").default(""),
  /** Vision model id (default `qwen-vl-plus`). */
  visionModel: z.string().default(DEFAULT_VISION_MODEL),
  /** OpenAI-compatible vision base URL. */
  visionBaseUrl: z.string().default(DEFAULT_VISION_BASE_URL),
});
