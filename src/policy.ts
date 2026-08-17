/**
 * Steer text-only models away from `read_image` and toward `analyze_image`.
 *
 * 1. A system-prompt section names the pathify prefix and the replacement tool.
 * 2. `tools/pre-execute` denies `read_image` when the routed model does not
 *    declare image input, with a reason that names `analyze_image`.
 * @module dsh-image-pathify/policy
 */

import type { Context } from "@deepseek-ai/cordis";
import type { PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";
import type { Config } from "./config.ts";

/** Prompt-section order in the 100–199 per-tool guidance band. */
export const VISION_PROMPT_ORDER = 118;

/** Structural face of the calling agent used to resolve the routed model. */
export interface RouteSource {
  session?: {
    requestHeader?: () =>
      | { config?: { provider?: string; model?: string } }
      | undefined;
  };
  options?: { provider?: string; model?: string };
}

/**
 * Build the model-facing vision rule, interpolating the live pathify prefix.
 */
export function visionPromptText(prefix: string): string {
  const shown = prefix.length > 0 ? prefix : "Saved attachments: ";
  return [
    `When the user sends, pastes, or references an image, call analyze_image — never read_image — unless the current model declares image input.`,
    `Text that starts with "${shown}" is a saved image file. Strip that prefix and pass the remaining absolute path to analyze_image, with a question about the image.`,
    `When several images appear in the same turn, pass every path in a single analyze_image call via the images array. Do not call analyze_image once per image.`,
    `analyze_image also accepts an http(s) image URL. If analyze_image fails because the vision API is not configured, tell the user to open Settings → Plugins → Vision and set the API key and model.`,
  ].join(" ");
}

/**
 * Deny reason shown to the model when it calls `read_image` on a text-only route.
 */
export function readImageDenyReason(filePath: string): string {
  const path = filePath.trim().length > 0 ? filePath.trim() : "<image path>";
  return `Do not use read_image: the current model cannot accept image input. Call analyze_image with image="${path}" (the absolute path, without any "Saved attachments:" prefix) to get a text description instead.`;
}

/**
 * Resolve the provider/model pair the calling agent is routed to.
 */
export function routedModel(agent: RouteSource | undefined):
  | {
      provider: string;
      model: string;
    }
  | undefined {
  const routed = agent?.session?.requestHeader?.()?.config;
  const provider = routed?.provider ?? agent?.options?.provider;
  const model = routed?.model ?? agent?.options?.model;
  if (provider === undefined || model === undefined) return undefined;
  return { provider, model };
}

/**
 * True when the routed model explicitly declares image input. Unknown
 * capability is treated as non-vision (deny `read_image`).
 */
export async function routeAcceptsImage(
  ctx: Context,
  agent: RouteSource | undefined,
  signal?: AbortSignal,
): Promise<boolean> {
  const route = routedModel(agent);
  const llm = ctx.get("llm") as
    | {
        resolveModelInfo: (
          provider: string,
          model: string,
          signal?: AbortSignal,
        ) => Promise<{ inputModalities?: readonly string[] }>;
      }
    | undefined;
  if (route === undefined || llm === undefined) return false;
  let info: { inputModalities?: readonly string[] };
  try {
    info = await llm.resolveModelInfo(route.provider, route.model, signal);
  } catch {
    return false;
  }
  return (
    info.inputModalities !== undefined && info.inputModalities.includes("image")
  );
}

/**
 * `tools/pre-execute` listener: deny `read_image` on non-vision routes.
 */
export async function readImagePreExecute(
  ctx: Context,
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  if (exec.name !== "read_image") return next();
  if (await routeAcceptsImage(ctx, exec.agent, exec.signal)) return next();
  const filePath =
    typeof exec.arguments === "object" &&
    exec.arguments !== null &&
    "file_path" in exec.arguments &&
    typeof (exec.arguments as { file_path?: unknown }).file_path === "string"
      ? (exec.arguments as { file_path: string }).file_path
      : "";
  return { kind: "deny", reason: readImageDenyReason(filePath) };
}

/**
 * Register the prompt section. Reads `current` live so a prefix change is
 * visible on the next assembly. The `read_image` gate is registered from
 * `apply` on the tools fiber, which may load without `systemPrompt`.
 */
export function installVisionPolicy(ctx: Context, current: () => Config): void {
  ctx.systemPrompt.section({
    name: "tool:analyze-image",
    order: VISION_PROMPT_ORDER,
    text: () => visionPromptText(current().prefix),
  });
}
