/**
 * Shared default literals. Kept free of Node and DSH imports so the client
 * bundle can reuse them without pulling schemastery or host services.
 * @module dsh-image-pathify/defaults
 */

/** Default pathify prefix placed before each durable local path. Not user-facing. */
export const DEFAULT_PREFIX = "Saved attachments: ";

/** Default vision model id (DeepSeek official vision). */
export const DEFAULT_VISION_MODEL = "deepseek-v4-flash-vision-exp";

/** Default OpenAI-compatible vision endpoint (DeepSeek official). */
export const DEFAULT_VISION_BASE_URL = "https://api.deepseek.com";

/**
 * Default credential reference for the vision API key. The literal lives in
 * `$DSH_HOME/.credentials.yaml`, not in the settings document.
 */
export const DEFAULT_API_KEY_ENV = "IMAGE_PATHIFY_API_KEY";

/** Default `max_tokens` for a vision completion. `0` omits the field. */
export const DEFAULT_MAX_TOKENS = 2048;

/**
 * Inclusive lower bound for the vision output cap. `0` means do not send
 * `max_tokens` and let the provider pick its own default.
 */
export const MIN_VISION_MAX_TOKENS = 0;

/** Default: disable thinking on DeepSeek-style vision endpoints. */
export const DEFAULT_DISABLE_THINKING = true;

/** Inclusive upper bound for the vision output cap. */
export const MAX_VISION_MAX_TOKENS = 32768;
