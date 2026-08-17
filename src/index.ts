/**
 * dsh-image-pathify — let models without image input (deepseek-v4-flash, …)
 * receive image messages, and analyze those images through a built-in
 * OpenAI-compatible vision tool (`analyze_image`).
 *
 * Two-layer split, installed entirely from this plugin:
 *
 * 1. The session keeps real image blocks (the Web UI keeps rendering
 *    thumbnails); nothing is rewritten at admission or at save time.
 * 2. Immediately before adapter dispatch, the `llm/stream` waterfall
 *    rewrites image blocks to `Saved attachments: <absolute path>` text
 *    blocks when the target model lacks the image input modality.
 *    `analyze_image` then reads those files through the configured vision
 *    API. Immediately before dispatch, `llm/stream` also drops `read_image`
 *    for text-only models and `analyze_image` for vision models, using the
 *    provider/model on that request (not the possibly-stale agent options).
 *    `read_image` is denied on non-vision routes so a leftover call is
 *    steered to `analyze_image`. Vision-capable models keep original image
 *    blocks; `analyze_image` is omitted from their request and denied if
 *    they still call it.
 *
 * Because the host's image admission preflights (`session.prompt`,
 * `session.selectModel`) have no plugin seam, this plugin also installs a
 * small, configurable shim on `ctx.llm.resolveModelInfo` so those gates
 * admit images for the configured text-only models (see {@link admission}).
 *
 * `llm` is required. `tools`, `systemPrompt`, `settings`, and `typert` are
 * joined with nested `ctx.inject` so pathify still loads in a composition
 * that has only the LLM seam (and so unit tests that stub only `llm` keep
 * working). A web profile provides all of them.
 * @module dsh-image-pathify
 */

import type { Context } from "@deepseek-ai/cordis";
import type { AttachmentStore } from "@deepseek-ai/dsh-attachment";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import { deepFreeze } from "@deepseek-ai/dsh-llm";
// Side-effect type import: merges the `llm/stream` event and `ctx.llm` into
// the program so `ctx.on('llm/stream', …)` and `ctx.llm` type-check.
import type {} from "@deepseek-ai/dsh-llm";
import type {} from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-typert-registry";
import type {} from "@deepseek-ai/dsh-system-prompt";
import { installAdmissionShim } from "./admission.ts";
import { Config, type Config as ConfigShape } from "./config.ts";
import { messagesHaveImage, pathifyImages } from "./pathify.ts";
import {
  installVisionPolicy,
  filterDispatchForRoute,
  visionToolsPreExecute,
} from "./policy.ts";
import { ImagePathifyRuntime } from "./runtime.ts";
import {
  applySettingsUpdate,
  registerImagePathifySettings,
  toPublicSettings,
} from "./settings.ts";
import { registerAnalyzeImageTool } from "./tool.ts";
import { TYPERT_MANIFEST } from "./typert.ts";
import { checkPluginUpdate } from "./update.ts";

export { Config } from "./config.ts";
export {
  DEFAULT_API_KEY_ENV,
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "./defaults.ts";
export { IMAGE_PATHIFY_NAMESPACE } from "./settings.ts";
export { toPublicSettings } from "./settings.ts";
export {
  DEFAULT_VISION_PROMPT,
  analyzeImage,
  analyzeImages,
  formatMultiImageResult,
  isRemoteImageUrl,
  multiImagePrompt,
} from "./vision.ts";
export { collectImageSources } from "./tool.ts";
export {
  ANALYZE_IMAGE_TOOL,
  READ_IMAGE_TOOL,
  VISION_PROMPT_NAME,
  VISION_PROMPT_ORDER,
  analyzeImageDenyReason,
  analyzeImagePreExecute,
  assembleVisionPolicy,
  filterAssemblyForRoute,
  filterDispatchForRoute,
  readImageDenyReason,
  readImagePreExecute,
  requestHeaderRoute,
  routeAcceptsImage,
  routedModel,
  stripAnalyzeImage,
  visionPromptText,
  visionToolsPreExecute,
} from "./policy.ts";

/** Cordis plugin name used by Loader diagnostics. */
export const name = "dsh-image-pathify";

/** `llm` is required for pathify. Other seams activate through nested inject. */
export const inject = ["llm"];

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
 * Drop the off-route image tool using the provider/model on this request.
 */
function applyDispatchPolicy(
  ctx: Context,
  options: GenerateOptions,
  vision: boolean,
): GenerateOptions {
  const filtered = filterDispatchForRoute(options, vision);
  if (filtered === options) return options;
  return Object.isFrozen(options)
    ? deepFreeze(filtered as GenerateOptions)
    : (filtered as GenerateOptions);
}

/**
 * Wrap one `llm/stream` dispatch. Model capability resolution is async, but
 * the waterfall chain composes synchronously, so the decision is deferred
 * into an async generator — the same pattern the harness's own
 * `session-checkpoint-policy` uses on this event. Catalog filtering uses
 * the dispatched provider/model so the first step is not poisoned by a
 * stale `agent.options`. When a rewrite applies, the request re-enters the
 * waterfall (the re-dispatch passes through this listener untouched because
 * the rewritten messages carry no image blocks and the catalog is already
 * filtered); otherwise the original chain continues via `next()`.
 */
function pathifyStream(
  ctx: Context,
  options: GenerateOptions,
  next: () => AsyncIterable<StreamChunk>,
): AsyncIterable<StreamChunk> {
  return (async function* (): AsyncIterable<StreamChunk> {
    const vision = !(await shouldRewrite(ctx, options));
    const routed = applyDispatchPolicy(ctx, options, vision);
    if (vision || !messagesHaveImage(routed.messages)) {
      if (routed === options) {
        yield* next();
        return;
      }
      yield* ctx.llm.stream(routed);
      return;
    }
    const attachments = ctx.get("attachments") as AttachmentStore | undefined;
    if (attachments === undefined) {
      if (routed === options) {
        yield* next();
        return;
      }
      yield* ctx.llm.stream(routed);
      return;
    }
    options.signal?.throwIfAborted();
    const rewritten = await pathifyImages(routed, attachments, options.signal);
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
export function apply(ctx: Context, config?: object): void {
  const resolved: ConfigShape = Config((config ?? {}) as never) as ConfigShape;
  let fromSettings: (() => ConfigShape) | undefined;
  const current = (): ConfigShape => fromSettings?.() ?? resolved;

  ctx.on(
    "llm/stream",
    (options: GenerateOptions, next: () => AsyncIterable<StreamChunk>) => {
      return pathifyStream(ctx, options, next);
    },
  );

  let disposeShim: (() => void) | undefined;
  const syncAdmission = (): void => {
    disposeShim?.();
    disposeShim = undefined;
    if (current().relaxAdmission) {
      disposeShim = installAdmissionShim(ctx, { models: current().models });
    }
  };
  ctx.effect(() => {
    syncAdmission();
    return () => {
      disposeShim?.();
      disposeShim = undefined;
    };
  });

  ctx.inject(["settings"], (sctx: Context) => {
    const scope = registerImagePathifySettings(sctx, Config, resolved);
    fromSettings = () => scope.get();
    syncAdmission();
    scope.watch(() => {
      syncAdmission();
    });
    sctx.effect(() => () => {
      fromSettings = undefined;
      syncAdmission();
    });

    sctx.inject(["typert"], (tctx: Context) => {
      const updateProbe = checkPluginUpdate();
      new ImagePathifyRuntime(
        tctx,
        () => toPublicSettings(scope.get()),
        (update) => applySettingsUpdate(scope, update),
        () => updateProbe,
      );
      tctx.effect(() => {
        const dispose = tctx.typert.register(TYPERT_MANIFEST);
        return () => {
          void dispose();
        };
      }, "dsh-image-pathify: typert manifest");
    });
  });

  ctx.inject(["tools"], (tctx: Context) => {
    registerAnalyzeImageTool(tctx, current);
    tctx.on("tools/pre-execute", (exec, next) =>
      visionToolsPreExecute(tctx, exec, next),
    );
  });

  ctx.inject(["systemPrompt"], (pctx: Context) => {
    installVisionPolicy(pctx);
  });
}
