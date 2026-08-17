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
  DEFAULT_MULTI_MAX_TOKENS,
  DEFAULT_SINGLE_MAX_TOKENS,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
  MAX_VISION_MAX_TOKENS,
  MIN_VISION_MAX_TOKENS,
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
  readonly singleMaxTokens: number;
  readonly multiMaxTokens: number;
  readonly models: readonly PathifyModelEntry[];
  readonly relaxAdmission: boolean;
}

/**
 * Result of a silent npm latest-version probe. `updateAvailable` is the only
 * signal the card uses; a failed probe still returns this shape with
 * `updateAvailable: false`.
 */
export interface ImagePathifyUpdateStatus {
  readonly installedVersion: string;
  readonly latestVersion: string;
  readonly updateAvailable: boolean;
  readonly command: string;
}

/**
 * One field patch from the settings page. The API key is not a field here —
 * the card writes it through `credentials.set`.
 */
export interface ImagePathifySettingsUpdate {
  readonly apiKeyEnv?: string;
  readonly visionModel?: string;
  readonly visionBaseUrl?: string;
  readonly singleMaxTokens?: number;
  readonly multiMaxTokens?: number;
  readonly models?: readonly PathifyModelEntry[];
  readonly relaxAdmission?: boolean;
}

/** Schema defaults as the public wire shape (no secret). */
export function defaultPublicSettings(): ImagePathifyPublicSettings {
  return {
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    visionModel: DEFAULT_VISION_MODEL,
    visionBaseUrl: DEFAULT_VISION_BASE_URL,
    singleMaxTokens: DEFAULT_SINGLE_MAX_TOKENS,
    multiMaxTokens: DEFAULT_MULTI_MAX_TOKENS,
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

function readMaxTokens(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${field} must be an integer`);
  }
  if (value < MIN_VISION_MAX_TOKENS || value > MAX_VISION_MAX_TOKENS) {
    fail(
      `${field} must be between ${String(MIN_VISION_MAX_TOKENS)} and ${String(MAX_VISION_MAX_TOKENS)}`,
    );
  }
  return value;
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
      singleMaxTokens: readMaxTokens(value.singleMaxTokens, "singleMaxTokens"),
      multiMaxTokens: readMaxTokens(value.multiMaxTokens, "multiMaxTokens"),
      models: modelsRaw.map(readModel),
      relaxAdmission: readBoolean(value.relaxAdmission, "relaxAdmission"),
    };
  },
};

/** Strict codec for the update-probe result. */
export const updateStatusSchema: TypertSchema<ImagePathifyUpdateStatus> = {
  parse(value: unknown): ImagePathifyUpdateStatus {
    if (!isRecord(value)) fail("update status must be an object");
    return {
      installedVersion: readString(value.installedVersion, "installedVersion"),
      latestVersion: readString(value.latestVersion, "latestVersion"),
      updateAvailable: readBoolean(value.updateAvailable, "updateAvailable"),
      command: readString(value.command, "command"),
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
      ...(value.singleMaxTokens === undefined
        ? {}
        : {
            singleMaxTokens: readMaxTokens(
              value.singleMaxTokens,
              "singleMaxTokens",
            ),
          }),
      ...(value.multiMaxTokens === undefined
        ? {}
        : {
            multiMaxTokens: readMaxTokens(
              value.multiMaxTokens,
              "multiMaxTokens",
            ),
          }),
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
  {
    id: "dsh-image-pathify#imagePathify/getUpdate",
    service: "imagePathify",
    namespace: "imagePathify",
    method: "getUpdate",
    invocation: { kind: "direct" },
    parameters: [],
    result: {
      mode: "strict",
      typeSymbol: "dsh-image-pathify#ImagePathifyUpdateStatus",
      schema: updateStatusSchema,
    },
  },
];
