/**
 * Shared default literals. Kept free of Node and DSH imports so the client
 * bundle can reuse them without pulling schemastery or host services.
 * @module dsh-image-pathify/defaults
 */

/** Default pathify prefix (trailing space is significant). */
export const DEFAULT_PREFIX = "Saved attachments: ";

/** Default vision model id (DashScope compatible-mode). */
export const DEFAULT_VISION_MODEL = "qwen-vl-plus";

/** Default OpenAI-compatible vision endpoint (DashScope compatible-mode). */
export const DEFAULT_VISION_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";

/**
 * Default credential reference for the vision API key. The literal lives in
 * `$DSH_HOME/.credentials.yaml`, not in the settings document.
 */
export const DEFAULT_API_KEY_ENV = "IMAGE_PATHIFY_API_KEY";
