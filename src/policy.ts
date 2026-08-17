/**
 * Steer text-only models away from `read_image` and toward `analyze_image`,
 * and keep vision-capable models off `analyze_image` entirely.
 *
 * 1. A system-prompt section names the pathify prefix and the replacement tool.
 * 2. `llm/stream` drops `analyze_image` (vision) or `read_image` (text-only)
 *    using the provider/model actually being dispatched. Assemble-time
 *    filtering only runs after a request header exists, because the first
 *    step's `agent.options` can lag the UI-selected model.
 * 3. `tools/pre-execute` denies `read_image` on text-only routes (reason names
 *    `analyze_image`) and denies `analyze_image` on vision routes.
 * @module dsh-image-pathify/policy
 */

import type { Context } from "@deepseek-ai/cordis";
import type { PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";
import { DEFAULT_PREFIX } from "./defaults.ts";

/** Prompt-section order in the 100–199 per-tool guidance band. */
export const VISION_PROMPT_ORDER = 118;

/** System-prompt section that teaches `analyze_image` to text-only models. */
export const VISION_PROMPT_NAME = "tool:analyze-image";

/** Model-facing tool name registered by this plugin. */
export const ANALYZE_IMAGE_TOOL = "analyze_image";

/** Host tool that loads a local image into a vision model's context. */
export const READ_IMAGE_TOOL = "read_image";

/** Structural face of the calling agent used to resolve the routed model. */
export interface RouteSource {
  session?: {
    requestHeader?: () =>
      | { config?: { provider?: string; model?: string } }
      | undefined;
  };
  options?: { provider?: string; model?: string };
}

/** Shape of one prompt assembly this policy may filter. */
export interface PromptAssemblyLike {
  sections: { name: string }[];
  tools: { name: string }[];
}

/** Per-assembly context that may carry the live agent and turn signal. */
export interface AssembleRoute {
  agent?: RouteSource;
  signal?: AbortSignal;
}

/**
 * Build the model-facing vision rule. The pathify prefix is a fixed marker,
 * not a user setting.
 */
export function visionPromptText(): string {
  return [
    `When the user sends, pastes, or references an image — including an embedded image, a file:// URL, or a local path ending in .png/.jpg/.jpeg/.gif/.webp/.bmp — call analyze_image with the absolute path. Never call read_image for an image.`,
    `Text that starts with "${DEFAULT_PREFIX}" is a saved image file. Strip that prefix and pass the remaining absolute path to analyze_image, with a question about the image.`,
    `When several images appear in the same turn, pass every path in a single analyze_image call via the images array. Do not call analyze_image once per image.`,
    `analyze_image also accepts an http(s) image URL. If analyze_image fails because the vision API is not configured, tell the user to open Settings → Plugins → Vision and set the API key and model.`,
  ].join(" ");
}

/**
 * Deny reason shown to the model when it calls `read_image` on a text-only route.
 */
export function readImageDenyReason(filePath: string): string {
  const path = filePath.trim().length > 0 ? filePath.trim() : "<image path>";
  return `Do not use read_image: the current model cannot accept image input. Call analyze_image with image="${path}" (the absolute path, without any "${DEFAULT_PREFIX.trimEnd()}" prefix) to get a text description instead.`;
}

/**
 * Deny reason shown to the model when it calls `analyze_image` on a vision route.
 */
export function analyzeImageDenyReason(): string {
  return "Do not use analyze_image: the current model can view images. If an image is already in the conversation, describe it directly. If the user only gave a local file path, call read_image with that path instead.";
}

/**
 * Drop this plugin's prompt section and tool schema from one assembly.
 */
export function stripAnalyzeImage<T extends PromptAssemblyLike>(assembly: T): T {
  return {
    ...assembly,
    sections: assembly.sections.filter(
      (section) => section.name !== VISION_PROMPT_NAME,
    ),
    tools: assembly.tools.filter((tool) => tool.name !== ANALYZE_IMAGE_TOOL),
  } as T;
}

/**
 * Hide the tool the current route must not see. Vision keeps `read_image`;
 * text-only keeps `analyze_image`.
 */
export function filterAssemblyForRoute<T extends PromptAssemblyLike>(
  assembly: T,
  vision: boolean,
): T {
  if (vision) return stripAnalyzeImage(assembly);
  const tools = assembly.tools.filter((tool) => tool.name !== READ_IMAGE_TOOL);
  if (tools.length === assembly.tools.length) return assembly;
  return { ...assembly, tools } as T;
}

/** One adapter-facing request whose tool catalog and system text we may trim. */
export interface DispatchRequest {
  tools?: readonly { name: string }[];
  system?: string;
}

/**
 * Drop the off-route image tool from a live `llm/stream` request. Vision also
 * loses the text-only `analyze_image` prompt paragraph, if it is present.
 */
export function filterDispatchForRoute<T extends DispatchRequest>(
  request: T,
  vision: boolean,
): T {
  const deny = vision ? ANALYZE_IMAGE_TOOL : READ_IMAGE_TOOL;
  const tools = request.tools;
  const nextTools = tools?.filter((tool) => tool.name !== deny);
  const toolsChanged =
    nextTools !== undefined && nextTools.length !== (tools?.length ?? 0);
  let system = request.system;
  if (vision && typeof system === "string") {
    const paragraph = visionPromptText();
    if (paragraph.length > 0 && system.includes(paragraph)) {
      system = system
        .replace(paragraph, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  }
  const systemChanged = system !== request.system;
  if (!toolsChanged && !systemChanged) return request;
  return {
    ...request,
    ...(toolsChanged ? { tools: nextTools } : {}),
    ...(systemChanged ? { system } : {}),
  };
}

/**
 * Provider/model from the logged request header only. The first step of a
 * session has no header yet; `agent.options` can still hold a previous UI
 * selection, so it is not used here.
 */
export function requestHeaderRoute(
  agent: RouteSource | undefined,
): { provider: string; model: string } | undefined {
  const routed = agent?.session?.requestHeader?.()?.config;
  const provider = routed?.provider;
  const model = routed?.model;
  if (provider === undefined || model === undefined) return undefined;
  return { provider, model };
}

/**
 * `system-prompt/assemble` listener: hide the off-route image tool once the
 * session has a request header. Before that, leave both tools in place so
 * `llm/stream` can filter against the model actually being dispatched.
 */
export async function assembleVisionPolicy<T extends PromptAssemblyLike>(
  ctx: Context,
  _assembly: T,
  context: AssembleRoute,
  next: () => Promise<T>,
): Promise<T> {
  const result = await next();
  const header = requestHeaderRoute(context.agent);
  if (header === undefined) return result;
  const vision = await routeAcceptsImage(
    ctx,
    { options: header },
    context.signal,
  );
  return filterAssemblyForRoute(result, vision);
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
 * `tools/pre-execute` listener: deny `analyze_image` on vision routes.
 */
export async function analyzeImagePreExecute(
  ctx: Context,
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  if (exec.name !== ANALYZE_IMAGE_TOOL) return next();
  if (!(await routeAcceptsImage(ctx, exec.agent, exec.signal))) return next();
  return { kind: "deny", reason: analyzeImageDenyReason() };
}

/**
 * Combined `tools/pre-execute` gate for both image tools.
 */
export async function visionToolsPreExecute(
  ctx: Context,
  exec: ToolExecution,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  if (exec.name === "read_image") return readImagePreExecute(ctx, exec, next);
  if (exec.name === ANALYZE_IMAGE_TOOL) {
    return analyzeImagePreExecute(ctx, exec, next);
  }
  return next();
}

/**
 * Register the prompt section and the assemble filter. Tool execution gates
 * are registered from `apply` on the tools fiber, which may load without
 * `systemPrompt`.
 */
export function installVisionPolicy(ctx: Context): void {
  ctx.systemPrompt.section({
    name: VISION_PROMPT_NAME,
    order: VISION_PROMPT_ORDER,
    text: () => visionPromptText(),
  });
  ctx.on("system-prompt/assemble", (assembly, context, next) =>
    assembleVisionPolicy(ctx, assembly, context, next),
  );
}
