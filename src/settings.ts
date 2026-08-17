/**
 * The `image-pathify` settings namespace: the vision credential *reference*
 * plus the pathify tunables edited from the Web settings page. The key
 * literal is not a field here. Registered with `{ applies: 'live' }` so a
 * saved change takes effect without a restart.
 * @module dsh-image-pathify/settings
 */

import type { Context } from "@deepseek-ai/cordis";
import type {
  SettingsNamespace,
  SettingsScope,
} from "@deepseek-ai/dsh-settings";
import type { Config } from "./config.ts";
import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
} from "./contract.ts";
import { credentialRefName } from "./credentials.ts";

/** Branded namespace name (plugin-owned; not on the host Web allowlist). */
export const IMAGE_PATHIFY_NAMESPACE = "image-pathify" as SettingsNamespace;

/**
 * Project the stored section into the wire-safe public shape. The key
 * literal never leaves the host on this object.
 */
export function toPublicSettings(value: Config): ImagePathifyPublicSettings {
  return {
    apiKeyEnv: credentialRefName(value.apiKeyEnv),
    visionModel: value.visionModel,
    visionBaseUrl: value.visionBaseUrl,
    singleMaxTokens: value.singleMaxTokens,
    multiMaxTokens: value.multiMaxTokens,
    prefix: value.prefix,
    models: value.models.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
    })),
    relaxAdmission: value.relaxAdmission,
  };
}

/**
 * Apply one UI patch onto the owner scope. Secret literals are ignored —
 * they belong to the credentials store.
 */
export async function applySettingsUpdate(
  scope: SettingsScope<Config>,
  update: ImagePathifySettingsUpdate,
): Promise<ImagePathifyPublicSettings> {
  const patch: Partial<Config> = {};
  if (update.apiKeyEnv !== undefined) {
    patch.apiKeyEnv = credentialRefName(update.apiKeyEnv);
  }
  if (update.visionModel !== undefined) patch.visionModel = update.visionModel;
  if (update.visionBaseUrl !== undefined) {
    patch.visionBaseUrl = update.visionBaseUrl;
  }
  if (update.singleMaxTokens !== undefined) {
    patch.singleMaxTokens = update.singleMaxTokens;
  }
  if (update.multiMaxTokens !== undefined) {
    patch.multiMaxTokens = update.multiMaxTokens;
  }
  if (update.prefix !== undefined) patch.prefix = update.prefix;
  if (update.models !== undefined) {
    patch.models = update.models
      .map((entry) => ({
        provider: entry.provider.trim(),
        model: entry.model.trim(),
      }))
      .filter((entry) => entry.provider.length > 0 && entry.model.length > 0);
  }
  if (update.relaxAdmission !== undefined) {
    patch.relaxAdmission = update.relaxAdmission;
  }
  if (Object.keys(patch).length > 0) await scope.update(patch);
  return toPublicSettings(scope.get());
}

/**
 * Register the namespace against the live settings provider.
 * @param ctx - plugin context carrying `ctx.settings`.
 * @param schema - the plugin Config schema (composition base + user layer).
 * @param base - the Loader-resolved entry config.
 */
export function registerImagePathifySettings(
  ctx: Context,
  schema: unknown,
  base: Config,
): SettingsScope<Config> {
  return ctx.settings.register(IMAGE_PATHIFY_NAMESPACE, schema, {
    base,
    applies: "live",
  });
}
