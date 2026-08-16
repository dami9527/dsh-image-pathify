/**
 * Wire contract for the `imagePathify` Remote: public settings (no API key
 * literal) and the patch the settings page sends. Shared by the host Typert
 * manifest and the client `$mount` contribution.
 * @module dsh-image-pathify/contract
 */

import type {
  InvocationDescriptor,
  TypertSchema,
} from "@deepseek-ai/dsh-typert-protocol";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "./defaults.ts";

/** One provider/model pair the admission shim may relax. */
export interface PathifyModelEntry {
  readonly provider: string;
  readonly model: string;
}

/**
 * Settings the browser is allowed to see. The key literal never rides this
 * object; the client reads configured/writable from the credentials domain.
 */
export interface ImagePathifyPublicSettings {
  readonly apiKeyEnv: string;
  readonly visionModel: string;
  readonly visionBaseUrl: string;
  readonly prefix: string;
  readonly models: readonly PathifyModelEntry[];
  readonly relaxAdmission: boolean;
}

/**
 * One field patch from the settings page. The API key is not a field here —
 * the card writes it through `credentials.set`.
 */
export interface ImagePathifySettingsUpdate {
  readonly apiKeyEnv?: string;
  readonly visionModel?: string;
  readonly visionBaseUrl?: string;
  readonly prefix?: string;
  readonly models?: readonly PathifyModelEntry[];
  readonly relaxAdmission?: boolean;
}

/** Schema defaults as the public wire shape (no secret). */
export function defaultPublicSettings(): ImagePathifyPublicSettings {
  return {
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    visionModel: DEFAULT_VISION_MODEL,
    visionBaseUrl: DEFAULT_VISION_BASE_URL,
    prefix: DEFAULT_PREFIX,
    models: [],
    relaxAdmission: true,
  };
}

function fail(message: string): never {
  throw new TypeError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string): string {
  return typeof value === "string" ? value : fail(`${field} must be a string`);
}

function readBoolean(value: unknown, field: string): boolean {
  return typeof value === "boolean"
    ? value
    : fail(`${field} must be a boolean`);
}

function readModel(value: unknown): PathifyModelEntry {
  if (!isRecord(value)) fail("models[] must be an object");
  const provider = readString(value.provider, "models[].provider").trim();
  const model = readString(value.model, "models[].model").trim();
  if (provider.length === 0 || model.length === 0) {
    fail("models[] requires non-empty provider and model");
  }
  return { provider, model };
}

/** Strict codec for the public settings object. */
export const publicSettingsSchema: TypertSchema<ImagePathifyPublicSettings> = {
  parse(value: unknown): ImagePathifyPublicSettings {
    if (!isRecord(value)) fail("settings must be an object");
    const modelsRaw = value.models;
    if (!Array.isArray(modelsRaw)) fail("models must be an array");
    return {
      apiKeyEnv: readString(value.apiKeyEnv, "apiKeyEnv"),
      visionModel: readString(value.visionModel, "visionModel"),
      visionBaseUrl: readString(value.visionBaseUrl, "visionBaseUrl"),
      prefix: readString(value.prefix, "prefix"),
      models: modelsRaw.map(readModel),
      relaxAdmission: readBoolean(value.relaxAdmission, "relaxAdmission"),
    };
  },
};

/** Strict codec for one UI patch. Every field is optional. */
export const settingsUpdateSchema: TypertSchema<ImagePathifySettingsUpdate> = {
  parse(value: unknown): ImagePathifySettingsUpdate {
    if (!isRecord(value)) fail("update must be an object");
    const update: ImagePathifySettingsUpdate = {
      ...(value.apiKeyEnv === undefined
        ? {}
        : { apiKeyEnv: readString(value.apiKeyEnv, "apiKeyEnv") }),
      ...(value.visionModel === undefined
        ? {}
        : { visionModel: readString(value.visionModel, "visionModel") }),
      ...(value.visionBaseUrl === undefined
        ? {}
        : { visionBaseUrl: readString(value.visionBaseUrl, "visionBaseUrl") }),
      ...(value.prefix === undefined
        ? {}
        : { prefix: readString(value.prefix, "prefix") }),
      ...(value.models === undefined
        ? {}
        : {
            models: Array.isArray(value.models)
              ? value.models.map(readModel)
              : fail("models must be an array"),
          }),
      ...(value.relaxAdmission === undefined
        ? {}
        : {
            relaxAdmission: readBoolean(value.relaxAdmission, "relaxAdmission"),
          }),
    };
    return update;
  },
};

/** Host invocation descriptors shared with the client `$mount` contribution. */
export const IMAGE_PATHIFY_INVOCATIONS: readonly InvocationDescriptor[] = [
  {
    id: "dsh-image-pathify#imagePathify/getSettings",
    service: "imagePathify",
    namespace: "imagePathify",
    method: "getSettings",
    invocation: { kind: "direct" },
    parameters: [],
    result: {
      mode: "strict",
      typeSymbol: "dsh-image-pathify#ImagePathifyPublicSettings",
      schema: publicSettingsSchema,
    },
  },
  {
    id: "dsh-image-pathify#imagePathify/updateSettings",
    service: "imagePathify",
    namespace: "imagePathify",
    method: "updateSettings",
    invocation: { kind: "direct" },
    parameters: [
      {
        name: "update",
        wire: "update",
        source: "json",
        codec: {
          mode: "strict",
          typeSymbol: "dsh-image-pathify#ImagePathifySettingsUpdate",
          schema: settingsUpdateSchema,
        },
      },
    ],
    result: {
      mode: "strict",
      typeSymbol: "dsh-image-pathify#ImagePathifyPublicSettings",
      schema: publicSettingsSchema,
    },
  },
];
