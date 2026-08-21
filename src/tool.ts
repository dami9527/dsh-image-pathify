/**
 * Model-facing `analyze_image` tool: a local path or URL in, a text
 * description out, via the configured OpenAI-compatible vision endpoint.
 * Several images in one call are sent together in a single vision request.
 * Registered as a raw JSON-schema tool (no `defineTool` runtime import) so
 * this module loads in tests without `@deepseek-ai/dsh-tools` installed.
 * @module dsh-image-pathify/tool
 */

import type { Context } from "@deepseek-ai/cordis";
import type { Config } from "./config.ts";
import { resolveVisionApiKey } from "./credentials.ts";
import { DEFAULT_VISION_MODEL } from "./defaults.ts";
import {
  analyzeImage,
  analyzeImages,
  DEFAULT_VISION_PROMPT,
} from "./vision.ts";

/**
 * Collect unique non-empty image sources from `image` and/or `images`.
 * `image` may be a string or an array (models sometimes dump every path
 * into the singular field).
 */
export function collectImageSources(args: {
  image?: unknown;
  images?: unknown;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown): void => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };
  if (Array.isArray(args.image)) {
    for (const item of args.image) add(item);
  } else {
    add(args.image);
  }
  if (Array.isArray(args.images)) {
    for (const item of args.images) add(item);
  }
  return out;
}

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
      'Analyze one or more images at local absolute paths or HTTP(S) URLs and return text descriptions. Use this instead of read_image when the current model cannot view images, including when the user gives a local image path rather than embedding the file. If you can already see the image, answer directly and do not call this tool. Conversation text that starts with "Saved attachments: " is a saved image file — pass the absolute path after that prefix. When the user sends several images, pass every path in a single call via images (or an image array). Do not call this tool once per image.',
    parameters: {
      type: "object",
      properties: {
        image: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
          description:
            'Absolute local image path, or an http(s) URL. Do not include the "Saved attachments: " prefix. For several images, prefer images.',
        },
        images: {
          type: "array",
          items: { type: "string" },
          description:
            "One or more absolute local paths or http(s) URLs. When the user sends several images in the same turn, pass every path here in a single call.",
        },
        prompt: {
          type: "string",
          description:
            "Question about the image(s). Defaults to a detailed Chinese description.",
        },
      },
    },
    output: {
      schema: { type: "string" },
      render: (_args: unknown, value: string) => [
        { type: "text", text: value },
      ],
    },
    presentCall: (args: { image?: unknown; images?: unknown }) => {
      const sources = collectImageSources(args);
      if (sources.length === 0) return undefined;
      if (sources.length === 1) {
        const only = sources[0]!;
        return {
          card: "generic",
          title: only,
          kind: "read",
          rawInput: only,
        };
      }
      return {
        card: "generic",
        title: `${String(sources.length)} images`,
        kind: "read",
        rawInput: sources.join("\n"),
      };
    },
    async execute(
      args: { image?: unknown; images?: unknown; prompt?: string },
      exec: { signal: AbortSignal },
    ) {
      const images = collectImageSources(args);
      if (images.length === 0) {
        throw new Error("image or images must include a non-empty path or URL");
      }
      const settings = current();
      const prompt =
        typeof args.prompt === "string" && args.prompt.trim().length > 0
          ? args.prompt.trim()
          : DEFAULT_VISION_PROMPT;
      const request = {
        apiKey: await resolveVisionApiKey(ctx, settings.apiKeyEnv),
        model: settings.visionModel.trim() || DEFAULT_VISION_MODEL,
        baseUrl: settings.visionBaseUrl,
        prompt,
        signal: exec.signal,
        disableThinking: settings.disableThinking,
        maxTokens: settings.maxTokens,
      };
      if (images.length === 1) {
        return analyzeImage({
          ...request,
          image: images[0]!,
        });
      }
      return analyzeImages({
        ...request,
        images,
      });
    },
  });
}
