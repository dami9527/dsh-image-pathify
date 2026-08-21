/**
 * OpenAI-compatible vision request: POST `{baseUrl}/chat/completions` with
 * one or more `image_url` parts (a data URL for a local file, or an http(s)
 * URL) and a text prompt. Several images share a single completion so the
 * vision model actually sees every attachment. Ported from
 * claude-vision-skill's `vision.js` without the clipboard fallback — pasted
 * chat images already have a durable disk path.
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
  jpe: "jpeg",
  jfif: "jpeg",
  png: "png",
  gif: "gif",
  webp: "webp",
  bmp: "bmp",
  tif: "tiff",
  tiff: "tiff",
  heic: "heic",
  heif: "heif",
  avif: "avif",
};

/** One vision completion. */
export interface VisionRequest {
  /** Bearer token for the compatible-mode endpoint. */
  apiKey: string;
  /** Vision model id (default `deepseek-v4-flash-vision-exp`). */
  model: string;
  /** OpenAI-compatible base URL, with or without a trailing slash. */
  baseUrl: string;
  /** Absolute local path or `http(s)://` URL. */
  image: string;
  /** Question about the image. */
  prompt: string;
  /** Optional abort for the HTTP round-trip and file read. */
  signal?: AbortSignal;
  /**
   * Optional `max_tokens`. `0` or omitted means do not send the field.
   */
  maxTokens?: number;
  /**
   * When true (default), DeepSeek-style endpoints get thinking disabled.
   * Set false to keep the provider default (DeepSeek thinks).
   */
  disableThinking?: boolean;
}

/** Shared fields for a multi-image vision request. */
export type VisionBatchRequest = Omit<VisionRequest, "image"> & {
  /** Absolute local paths or `http(s)://` URLs, sent in one completion. */
  images: readonly string[];
};

/** One OpenAI-compatible user-content part. */
type VisionContentPart =
  | { type: "image_url"; image_url: { url: string } }
  | { type: "text"; text: string };

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

/**
 * DeepSeek V4 (including `deepseek-v4-flash-vision-exp`) thinks by default.
 * Thinking tokens count against `max_tokens`; a 1024 cap often leaves
 * `message.content` empty. Captioning does not need a chain of thought, so
 * the request sends `thinking: { type: "disabled" }` — the same wire field
 * dsh-llm-deepseek uses for bounded output. Other providers must not see it.
 */
export function shouldDisableThinking(model: string, baseUrl: string): boolean {
  return /deepseek/i.test(model) || /deepseek\.com/i.test(baseUrl);
}

/** PNG / JPEG / GIF / WebP magic bytes, then filename extension, then jpeg. */
function imageSubtype(path: string, data: Uint8Array): string {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "png";
  }
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  ) {
    return "jpeg";
  }
  if (
    data.length >= 6 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46
  ) {
    return "gif";
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "webp";
  }
  const ext = extname(path).toLowerCase().replace(".", "");
  return MIME_BY_EXT[ext] ?? "jpeg";
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
  const subtype = imageSubtype(source, data);
  return `data:image/${subtype};base64,${Buffer.from(data).toString("base64")}`;
}

function assertVisionConfigured(apiKey: string, model: string): void {
  if (apiKey.trim().length === 0 || model.trim().length === 0) {
    throw new Error(
      "Vision API is not configured. Open Settings → Plugins → Vision and set the API key and model.",
    );
  }
}

/** Flatten OpenAI string or text-part-array content. */
function textFromContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part !== "object" || part === null) return "";
      const text = (part as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("")
    .trim();
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
  const choice = choices[0] as {
    finish_reason?: unknown;
    message?: { content?: unknown; reasoning_content?: unknown };
  };
  const message = choice.message;
  const content = textFromContent(message?.content);
  if (content.length > 0) return content;
  const reasoning = textFromContent(message?.reasoning_content);
  if (reasoning.length > 0) return reasoning;
  const finish =
    typeof choice.finish_reason === "string" && choice.finish_reason.length > 0
      ? ` (finish_reason=${choice.finish_reason})`
      : "";
  throw new Error(`Vision API returned an empty message${finish}`);
}

/**
 * Ask the vision model to describe every attached image by order number.
 */
export function multiImagePrompt(count: number, question: string): string {
  return [
    `以下共 ${String(count)} 张图片，已全部附上，按出现顺序编号为图1 到 图${String(count)}。`,
    "请按编号分别详细描述每一张，不要说只能看到一张图。",
    "",
    question,
  ].join("\n");
}

/**
 * Prefix the vision reply with the attachment order so the calling model
 * can map 图1 / 图2 back to file paths.
 */
export function formatMultiImageResult(
  images: readonly string[],
  description: string,
): string {
  const legend = images
    .map((image, index) => `${String(index + 1)}. ${image}`)
    .join("\n");
  return `Images in order:\n${legend}\n\n${description}`;
}

async function completeVision(
  request: VisionBatchRequest,
  io: VisionIo,
): Promise<string> {
  const apiKey = request.apiKey.trim();
  const model = request.model.trim();
  assertVisionConfigured(apiKey, model);
  if (request.images.length === 0) {
    throw new Error("image or images must include a non-empty path or URL");
  }
  const imageUrls = await Promise.all(
    request.images.map((image) => imageUrlPart(image, io, request.signal)),
  );
  request.signal?.throwIfAborted();
  const content: VisionContentPart[] = [
    ...imageUrls.map((url) => ({
      type: "image_url" as const,
      image_url: { url },
    })),
    { type: "text", text: request.prompt },
  ];
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content }],
    stream: false,
  };
  if (typeof request.maxTokens === "number" && request.maxTokens > 0) {
    body.max_tokens = request.maxTokens;
  }
  if (
    (request.disableThinking ?? true) &&
    shouldDisableThinking(model, request.baseUrl)
  ) {
    body.thinking = { type: "disabled" };
  }
  const response = await io.fetch(completionsUrl(request.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
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

/**
 * Call the configured vision model and return its text description.
 * @param request - endpoint, credentials, and image source.
 * @param io - optional file/HTTP seams (tests).
 */
export async function analyzeImage(
  request: VisionRequest,
  io: VisionIo = defaultIo,
): Promise<string> {
  return completeVision(
    {
      apiKey: request.apiKey,
      model: request.model,
      baseUrl: request.baseUrl,
      prompt: request.prompt,
      signal: request.signal,
      disableThinking: request.disableThinking,
      images: [request.image],
      maxTokens: request.maxTokens,
    },
    io,
  );
}

/**
 * Send every image in one vision completion (multiple `image_url` parts).
 * The returned text includes an order legend mapping 图N to each path.
 */
export async function analyzeImages(
  request: VisionBatchRequest,
  io: VisionIo = defaultIo,
): Promise<string> {
  if (request.images.length === 0) {
    throw new Error("image or images must include a non-empty path or URL");
  }
  if (request.images.length === 1) {
    return analyzeImage({ ...request, image: request.images[0]! }, io);
  }
  const text = await completeVision(
    {
      ...request,
      prompt: multiImagePrompt(request.images.length, request.prompt),
    },
    io,
  );
  return formatMultiImageResult(request.images, text);
}
