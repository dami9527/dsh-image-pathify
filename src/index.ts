/**
 * dsh-image-pathify — let models without image input (deepseek-v4-flash, …)
 * receive image messages.
 *
 * Two-layer split, installed entirely from this plugin:
 *
 * 1. The session keeps real image blocks (the Web UI keeps rendering
 *    thumbnails); nothing is rewritten at admission or at save time.
 * 2. Immediately before adapter dispatch, the `llm/stream` waterfall
 *    rewrites image blocks to `Saved attachments: <absolute path>` text
 *    blocks when the target model lacks the image input modality. A vision
 *    skill (claude-vision-skill's `vision.js`) then reads those files and
 *    turns them into image descriptions.
 *
 * Because the host's image admission preflights (`session.prompt`,
 * `session.selectModel`) have no plugin seam, this plugin also installs a
 * small, configurable shim on `ctx.llm.resolveModelInfo` so those gates
 * admit images for the configured text-only models (see {@link admission}).
 * @module dsh-image-pathify
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { AttachmentStore } from "@deepseek-ai/dsh-attachment";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
// Side-effect type import: merges the `llm/stream` event and `ctx.llm` into
// the program so `ctx.on('llm/stream', …)` and `ctx.llm` type-check.
import type {} from "@deepseek-ai/dsh-llm";
import { installAdmissionShim } from "./admission.ts";
import { messagesHaveImage, pathifyImages } from "./pathify.ts";

/** Cordis plugin name used by Loader diagnostics. */
export const name = "dsh-image-pathify";

/** Services whose seams this plugin joins. `attachments` is optional and read lazily. */
export const inject = ["llm"];

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
}

export const Config = z.object({
  /** Text placed before each durable path in the rewritten text block. */
  prefix: z.string().default("Saved attachments: "),
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
});

/**
 * True when the target model cannot carry image blocks. Unknown capabilities
 * are treated as non-vision (the same conservative default the harness's own
 * dispatch-time rewrite uses).
 */
async function shouldRewrite(
  ctx: Context,
  options: GenerateOptions,
): Promise<boolean> {
  let info;
  try {
    info = await ctx.llm.resolveModelInfo(
      options.provider,
      options.model,
      options.signal,
    );
  } catch {
    // Adapter capability lookup failed; fall through to the conservative
    // rewrite rather than breaking the stream with a resolution error.
    info = undefined;
  }
  return !(
    info?.inputModalities !== undefined &&
    info.inputModalities.includes("image")
  );
}

/**
 * Wrap one `llm/stream` dispatch. Model capability resolution is async, but
 * the waterfall chain composes synchronously, so the decision is deferred
 * into an async generator — the same pattern the harness's own
 * `session-checkpoint-policy` uses on this event. When a rewrite applies,
 * the request re-enters the waterfall with the rewritten messages (the
 * re-dispatch passes through this listener untouched because the rewritten
 * messages carry no image blocks); otherwise the original chain continues
 * via `next()`.
 */
function pathifyStream(
  ctx: Context,
  options: GenerateOptions,
  next: () => AsyncIterable<StreamChunk>,
  prefix: string,
): AsyncIterable<StreamChunk> {
  return (async function* (): AsyncIterable<StreamChunk> {
    if (!(await shouldRewrite(ctx, options))) {
      yield* next();
      return;
    }
    const attachments = ctx.get("attachments") as AttachmentStore | undefined;
    if (attachments === undefined) {
      // No store means no durable path to surface; leave the request alone.
      yield* next();
      return;
    }
    options.signal?.throwIfAborted();
    const rewritten = await pathifyImages(
      options,
      attachments,
      prefix,
      options.signal,
    );
    if (rewritten === options) {
      yield* next();
      return;
    }
    options.signal?.throwIfAborted();
    yield* ctx.llm.stream(rewritten);
  })();
}

/**
 * Install the plugin. Registrations are effects: the `llm/stream` listener
 * unregisters with the plugin's fiber, and the admission shim (when
 * installed) restores the original `resolveModelInfo` on disposal.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on(
    "llm/stream",
    (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => {
      if (!messagesHaveImage(options.messages)) return next();
      return pathifyStream(ctx, options, next, config.prefix);
    },
  );
  if (config.relaxAdmission) {
    ctx.effect(() => installAdmissionShim(ctx, { models: config.models }));
  }
}
