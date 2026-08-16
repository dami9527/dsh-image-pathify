/**
 * Model-facing `analyze_image` tool: a local path or URL in, a text
 * description out, via the configured OpenAI-compatible vision endpoint.
 * Registered as a raw JSON-schema tool (no `defineTool` runtime import) so
 * this module loads in tests without `@deepseek-ai/dsh-tools` installed.
 * @module dsh-image-pathify/tool
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Config } from "./config.ts";
import { DEFAULT_VISION_MODEL } from "./defaults.ts";
import { analyzeImage, DEFAULT_VISION_PROMPT } from "./vision.ts";

/**
 * Register `analyze_image`. `current` is read per call so a settings save
 * is picked up without remounting the tool.
 */
export function registerAnalyzeImageTool(
  ctx: Context,
  current: () => Config,
): void {
  ctx.tools.register({
    name: "analyze_image",
    description:
      'Analyze an image at a local absolute path or HTTP(S) URL and return a text description. Use this instead of read_image when the current model cannot view images. Conversation text that starts with the configured pathify prefix (default "Saved attachments: ") is a saved image file — pass the absolute path after that prefix.',
    parameters: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description:
            "Absolute local image path, or an http(s) URL. Do not include the pathify prefix.",
        },
        prompt: {
          type: "string",
          description:
            "Question about the image. Defaults to a detailed Chinese description.",
        },
      },
      required: ["image"],
    },
    output: {
      schema: { type: "string" },
      render: (_args: unknown, value: string) => [
        { type: "text", text: value },
      ],
    },
    presentCall: (args: { image?: string }) =>
      typeof args.image === "string"
        ? {
            card: "generic",
            title: args.image,
            kind: "read",
            rawInput: args.image,
          }
        : undefined,
    async execute(
      args: { image?: string; prompt?: string },
      exec: { signal: AbortSignal },
    ) {
      const image = typeof args.image === "string" ? args.image.trim() : "";
      if (image.length === 0) {
        throw new Error("image must be a non-empty path or URL");
      }
      const settings = current();
      return analyzeImage({
        apiKey: settings.apiKey,
        model: settings.visionModel.trim() || DEFAULT_VISION_MODEL,
        baseUrl: settings.visionBaseUrl,
        image,
        prompt:
          typeof args.prompt === "string" && args.prompt.trim().length > 0
            ? args.prompt.trim()
            : DEFAULT_VISION_PROMPT,
        signal: exec.signal,
      });
    },
  });
}
