/**
 * Dispatch-time image pathification: rewrite `image` content blocks to
 * `Saved attachments: <absolute path>` text blocks so a model without the
 * image input modality still receives the images it needs. A vision tool
 * (`analyze_image`) then reads those files and turns them into image
 * descriptions.
 *
 * The durable session message is NEVER touched: the Web UI keeps rendering
 * thumbnails from the real image block; only the adapter-facing request is
 * rewritten, immediately before dispatch. Top-level image blocks are
 * rewritten, including images on `role: "tool"` messages.
 * @module dsh-image-pathify/pathify
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AttachmentStore,
  ImageAttachmentRef,
} from "@deepseek-ai/dsh-attachment";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import type {
  ContentBlock,
  GenerateOptions,
  Message,
} from "@deepseek-ai/dsh-llm";
import { contentHasImage, freezeMessage } from "@deepseek-ai/dsh-llm";
import { DEFAULT_PREFIX } from "./defaults.ts";
import { deepFreeze } from "./freeze.ts";

/** Media type to file extension for materialized fallback copies. */
const MEDIA_EXTENSION: Readonly<Record<string, string>> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
};

/** True when any message in the request carries an image block. */
export function messagesHaveImage(messages: readonly Message[]): boolean {
  return messages.some((message) => contentHasImage(message.content));
}

/**
 * The host publishes the durable file through `imageHostPath()`. A throw
 * (malformed ref) means there is no published path; fall through to a copy.
 */
function publishedImagePath(
  attachments: AttachmentStore,
  ref: ImageAttachmentRef,
): string | undefined {
  const method = (attachments as { imageHostPath?: unknown }).imageHostPath;
  if (typeof method !== "function") return undefined;
  try {
    const path = (method as (next: ImageAttachmentRef) => unknown).call(
      attachments,
      ref,
    );
    return typeof path === "string" && path.length > 0 ? path : undefined;
  } catch {
    return undefined;
  }
}

function fallbackFilePath(ref: ImageAttachmentRef): string {
  const leaf = String(ref.attachmentId)
    .replace(/^sha256:/, "")
    .replace(/[^a-z0-9]/gi, "_");
  return join(
    resolveDshHome(),
    "attachments",
    "vision-paths",
    `${leaf}${MEDIA_EXTENSION[ref.mediaType] ?? ""}`,
  );
}

/**
 * Resolve the durable absolute on-disk path of one stored image.
 *
 * @param attachments - live attachment store service.
 * @param ref - durable reference from the session log.
 * @param signal - optional abort for the fallback byte read.
 * @returns the absolute path of a readable image file.
 */
export async function resolveImagePath(
  attachments: AttachmentStore,
  ref: ImageAttachmentRef,
  signal?: AbortSignal,
): Promise<string> {
  const published = publishedImagePath(attachments, ref);
  if (published !== undefined) return published;
  const file = fallbackFilePath(ref);
  try {
    await access(file);
    return file;
  } catch {
    // First materialization for this content-addressed leaf.
  }
  const stored = await attachments.readImage(ref, signal);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, stored.data);
  return file;
}

/**
 * Rewrite top-level image blocks. Unchanged lists and blocks keep their identity.
 * Tool messages on 0.1.7 carry images at the top level, not inside a nested
 * `tool-result` block.
 */
async function rewriteBlocks(
  blocks: readonly ContentBlock[],
  attachments: AttachmentStore,
  signal?: AbortSignal,
): Promise<readonly ContentBlock[]> {
  const next = await Promise.all(
    blocks.map(async (block): Promise<ContentBlock> => {
      if (block.type !== "image") return block;
      const path = await resolveImagePath(attachments, block.attachment, signal);
      return { type: "text", text: `${DEFAULT_PREFIX}${path}` };
    }),
  );
  if (next.every((block, index) => block === blocks[index])) return blocks;
  return next;
}

/**
 * Rewrite the adapter-facing request: every top-level image block becomes a
 * text block carrying the durable file path (one text block per image).
 *
 * @param options - the request to rewrite; messages are replaced only when
 * the request actually carries images.
 * @param attachments - live attachment store service.
 * @param signal - optional abort for path resolution.
 * @returns the original options when no rewrite applies, else a copy whose
 * messages keep their identity, sources, and non-image blocks.
 */
export async function pathifyImages(
  options: GenerateOptions,
  attachments: AttachmentStore,
  signal?: AbortSignal,
): Promise<GenerateOptions> {
  if (!messagesHaveImage(options.messages)) return options;
  const messages = await Promise.all(
    options.messages.map(async (message) => {
      if (!contentHasImage(message.content)) return message;
      const content = await rewriteBlocks(message.content, attachments, signal);
      if (content === message.content) return message;
      return freezeMessage({ ...message, content: [...content] });
    }),
  );
  if (messages.every((message, index) => message === options.messages[index])) {
    return options;
  }
  const rewritten = { ...options, messages };
  return Object.isFrozen(options) ? deepFreeze(rewritten) : rewritten;
}
