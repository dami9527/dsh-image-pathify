/**
 * Dispatch-time image pathification: rewrite `image` content blocks to
 * `Saved attachments: <absolute path>` text blocks so a model without the
 * image input modality still receives the images it needs — a vision skill
 * A vision tool (`analyze_image`) then reads those files and turns them
 * into image descriptions.
 *
 * The durable session message is NEVER touched: the Web UI keeps rendering
 * thumbnails from the real image block; only the adapter-facing request is
 * rewritten, immediately before dispatch.
 * @module dsh-image-pathify/pathify
 */

import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  AttachmentStore,
  ImageAttachmentRef,
} from "@deepseek-ai/dsh-attachment";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import type { GenerateOptions, Message } from "@deepseek-ai/dsh-llm";
import { contentHasImage, freezeMessage } from "@deepseek-ai/dsh-llm";
import { DEFAULT_PREFIX } from "./defaults.ts";
import { deepFreeze } from "./freeze.ts";

/** Content-addressed reference shape the local store mints and resolves. */
const ID_PATTERN = /^sha256:([a-f0-9]{64})$/;

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
 * Call one optional store path method. 0.1.2's `imageHostPath` throws on a
 * malformed ref; treat that as "no published path" and keep falling through.
 */
function publishedByMethod(
  method: unknown,
  attachments: AttachmentStore,
  ref: ImageAttachmentRef,
): string | undefined {
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

/**
 * Prefer a store-published path when the host already exposes one.
 *
 * 0.1.2-alpha.1 names this `imageHostPath()`. Earlier local stores used
 * `imagePath()`, or only published `root` plus the content-addressed object
 * layout (`objects/<sha256[0:2]>/<sha256>`). Any of those is a zero-copy
 * path the vision helper can read; anything else falls through to materialize.
 */
function publishedImagePath(
  attachments: AttachmentStore,
  ref: ImageAttachmentRef,
): string | undefined {
  const store = attachments as {
    imageHostPath?: unknown;
    imagePath?: unknown;
    root?: unknown;
  };
  const published =
    publishedByMethod(store.imageHostPath, attachments, ref) ??
    publishedByMethod(store.imagePath, attachments, ref);
  if (published !== undefined) return published;
  if (typeof store.root !== "string") return undefined;
  const sha = ID_PATTERN.exec(String(ref.attachmentId))?.[1];
  return sha === undefined
    ? undefined
    : join(store.root, "objects", sha.slice(0, 2), sha);
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
      const content = await Promise.all(
        message.content.map(async (block) => {
          if (block.type !== "image") return block;
          const path = await resolveImagePath(
            attachments,
            block.attachment,
            signal,
          );
          return { type: "text" as const, text: `${DEFAULT_PREFIX}${path}` };
        }),
      );
      if (content.every((block, index) => block === message.content[index])) {
        return message;
      }
      return freezeMessage({ ...message, content });
    }),
  );
  if (messages.every((message, index) => message === options.messages[index])) {
    return options;
  }
  const rewritten = { ...options, messages };
  return Object.isFrozen(options) ? deepFreeze(rewritten) : rewritten;
}
