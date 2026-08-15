/**
 * Host admission policy shim.
 *
 * The host's `session.prompt` / `session.selectModel` preflights refuse image
 * messages for models whose declared input modalities exclude `image`, and
 * there is no plugin seam on that gate. This wrapper reports
 * `inputModalities: undefined` (unknown) for the configured text-only models
 * while an attachment store is present, so the gates admit the image message;
 * the `llm/stream` pathifier then rewrites image blocks at dispatch, and the
 * vision-skill flow reads the durable files. Vision-capable models and
 * unknown-capability routes pass through untouched.
 * @module dsh-image-pathify/admission
 */

import { symbols } from "@deepseek-ai/cordis";
import type { Context } from "@deepseek-ai/cordis";
import type { LlmResolvedModelInfo } from "@deepseek-ai/dsh-llm";

/** One provider/model pair treated as a text-only route. */
export interface PathifyModel {
  provider: string;
  model: string;
}

/** Admission relaxation policy. */
export interface AdmissionConfig {
  /**
   * Restrict relaxation to these exact provider/model pairs; empty means
   * every model whose declared modalities exclude `image`.
   */
  models: readonly PathifyModel[];
}

/**
 * Reach the real service instance behind the context's traceable proxy.
 * Cordis wraps every service read in a per-access proxy whose `get` trap
 * wraps method reads, so assignments through `ctx.llm` never stick; the
 * proxy exposes its target under {@link symbols.original}.
 */
function unwrapService<T>(value: T): T {
  const target = (value as { [symbols.original]?: T })[symbols.original];
  return target ?? value;
}

/**
 * Install the shim on the real `LlmRuntime` instance behind `ctx.llm`.
 * @param ctx - plugin context carrying the live `llm` service.
 * @param config - relaxation policy.
 * @returns a disposer restoring the original method.
 */
export function installAdmissionShim(
  ctx: Context,
  config: AdmissionConfig,
): () => void {
  const llm = unwrapService(ctx.llm);
  const original = llm.resolveModelInfo.bind(llm);
  const wrapped = (async (
    provider: string,
    model: string,
    signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> => {
    const info = await original(provider, model, signal);
    // Without a store there is no durable path to surface, so the host gates
    // stay meaningful: keep rejecting non-vision routes.
    if (ctx.get("attachments") === undefined) return info;
    if (
      info.inputModalities === undefined ||
      info.inputModalities.includes("image")
    )
      return info;
    if (
      config.models.length > 0 &&
      !config.models.some(
        (entry) => entry.provider === provider && entry.model === model,
      )
    ) {
      return info;
    }
    const { inputModalities: _dropped, ...rest } = info;
    return rest as LlmResolvedModelInfo;
  }) as typeof llm.resolveModelInfo;
  llm.resolveModelInfo = wrapped;
  return () => {
    if (llm.resolveModelInfo === wrapped) llm.resolveModelInfo = original;
  };
}
