/**
 * OpenAI-compatible vision request: POST `{baseUrl}/chat/completions` with
 * one `image_url` part (a data URL for a local file, or an http(s) URL) and
 * a text prompt. Ported from claude-vision-skill's `vision.js` without the
 * clipboard fallback — pasted chat images already have a durable disk path.
 * @module dsh-image-pathify/vision
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";

/** Default question when the model omits `prompt`. */
export const DEFAULT_VISION_PROMPT = "请详细描述这张图片的内容。";

/** Filename extension → image MIME subtype used in the data URL. */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  gif: "gif",
  webp: "webp",
  bmp: "bmp",
};

/** One vision completion. */
export interface VisionRequest {
  /** Bearer token for the compatible-mode endpoint. */
  apiKey: string;
  /** Vision model id (default `qwen-vl-plus`). */
  model: string;
  /** OpenAI-compatible base URL, with or without a trailing slash. */
  baseUrl: string;
  /** Absolute local path or `http(s)://` URL. */
  image: string;
  /** Question about the image. */
  prompt: string;
  /** Optional abort for the HTTP round-trip and file read. */
  signal?: AbortSignal;
}

/** I/O seams tests replace. */
export interface VisionIo {
  readFile(path: string, signal?: AbortSignal): Promise<Uint8Array>;
  fetch: typeof fetch;
}

const defaultIo: VisionIo = {
  async readFile(path, signal) {
    return new Uint8Array(await readFile(path, { signal }));
  },
  fetch: (input, init) => globalThis.fetch(input, init),
};

/** True when `image` should be sent as a remote URL rather than a local file. */
export function isRemoteImageUrl(image: string): boolean {
  return /^https?:\/\//i.test(image.trim());
}

function completionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (trimmed.length === 0) {
    throw new Error(
      "Vision API base URL is empty. Open Settings → Plugins → Vision and set the endpoint.",
    );
  }
  return `${trimmed.replace(/\/?$/, "/")}chat/completions`;
}

async function imageUrlPart(
  image: string,
  io: VisionIo,
  signal?: AbortSignal,
): Promise<string> {
  const source = image.trim();
  if (source.length === 0)
    throw new Error("image must be a non-empty path or URL");
  if (isRemoteImageUrl(source)) return source;
  signal?.throwIfAborted();
  const data = await io.readFile(source, signal);
  const ext = extname(source).toLowerCase().replace(".", "");
  const subtype = MIME_BY_EXT[ext] ?? "jpeg";
  return `data:image/${subtype};base64,${Buffer.from(data).toString("base64")}`;
}

function contentFromResponse(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Vision API returned a non-object body");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices[0] === undefined) {
    throw new Error("Vision API returned no choices");
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string" && content.length > 0) return content;
  throw new Error("Vision API returned an empty message");
}

/**
 * Call the configured vision model and return its text description.
 * @param request - endpoint, credentials, and image source.
 * @param io - optional file/HTTP seams (tests).
 */
export async function analyzeImage(
  request: VisionRequest,
  io: VisionIo = defaultIo,
): Promise<string> {
  const apiKey = request.apiKey.trim();
  const model = request.model.trim();
  if (apiKey.length === 0 || model.length === 0) {
    throw new Error(
      "Vision API is not configured. Open Settings → Plugins → Vision and set the API key and model.",
    );
  }
  const imageUrl = await imageUrlPart(request.image, io, request.signal);
  request.signal?.throwIfAborted();
  const body = JSON.stringify({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: request.prompt },
        ],
      },
    ],
    stream: false,
    max_tokens: 1024,
  });
  const response = await io.fetch(completionsUrl(request.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    signal: request.signal,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Vision API ${String(response.status)}: ${text.slice(0, 300)}`,
    );
  }
  try {
    return contentFromResponse(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) return text;
    throw error;
  }
}
