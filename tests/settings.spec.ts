import { afterEach, describe, expect, it, vi } from "vitest";
import { Context, symbols } from "@deepseek-ai/cordis";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "../src/defaults.ts";
import { defaultPublicSettings } from "../src/contract.ts";
import { ImagePathifyRuntime } from "../src/runtime.ts";
import { applySettingsUpdate, toPublicSettings } from "../src/settings.ts";
import { credentialRefName, resolveVisionApiKey } from "../src/credentials.ts";
import type { Config } from "../src/config.ts";

const contexts: Context[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()));
});

/** The unproxied service original (cordis caller-tracking may wrap instances). */
function originalOf(service: object): object {
  const original = Reflect.get(service, symbols.original) as object | undefined;
  return original ?? service;
}

function sample(overrides: Partial<Config> = {}): Config {
  return {
    prefix: DEFAULT_PREFIX,
    models: [],
    relaxAdmission: true,
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    visionModel: DEFAULT_VISION_MODEL,
    visionBaseUrl: DEFAULT_VISION_BASE_URL,
    ...overrides,
  };
}

describe("toPublicSettings", () => {
  it("exposes the credential reference and never an apiKey field", () => {
    const publicSettings = toPublicSettings(sample());
    expect(publicSettings.apiKeyEnv).toBe(DEFAULT_API_KEY_ENV);
    expect(publicSettings).not.toHaveProperty("apiKey");
    expect(publicSettings).not.toHaveProperty("apiKeySet");
  });
});

describe("applySettingsUpdate", () => {
  it("writes non-secret fields", async () => {
    let stored = sample();
    const scope = {
      get: () => stored,
      watch: () => () => {},
      update: async (patch: Partial<Config>) => {
        stored = { ...stored, ...patch };
      },
    };
    await applySettingsUpdate(scope, { visionModel: "qwen-vl-max" });
    expect(stored.visionModel).toBe("qwen-vl-max");
  });
});

describe("credentialRefName", () => {
  it("falls back to the default when the name is not a POSIX identifier", () => {
    expect(credentialRefName("IMAGE_PATHIFY_API_KEY")).toBe(
      "IMAGE_PATHIFY_API_KEY",
    );
    expect(credentialRefName(" not valid ")).toBe(DEFAULT_API_KEY_ENV);
  });
});

describe("resolveVisionApiKey", () => {
  it("reads credentials, then the environment", async () => {
    const ctx = new Context();
    contexts.push(ctx);
    await expect(resolveVisionApiKey(ctx, DEFAULT_API_KEY_ENV)).resolves.toBe(
      "",
    );
    vi.stubEnv(DEFAULT_API_KEY_ENV, "sk-env");
    await expect(resolveVisionApiKey(ctx, DEFAULT_API_KEY_ENV)).resolves.toBe(
      "sk-env",
    );
    ctx.provide("credentials", {
      resolve: async () => ({ value: "sk-file", source: "file" }),
    });
    await expect(resolveVisionApiKey(ctx, DEFAULT_API_KEY_ENV)).resolves.toBe(
      "sk-file",
    );
  });
});

describe("ImagePathifyRuntime typertRemote", () => {
  it("exposes the Gateway-visible binding the settings RPC requires", () => {
    const ctx = new Context();
    contexts.push(ctx);
    new ImagePathifyRuntime(
      ctx,
      () => defaultPublicSettings(),
      async () => defaultPublicSettings(),
    );
    const runtime = ctx.get("imagePathify") as ImagePathifyRuntime | undefined;
    expect(runtime).toBeDefined();
    const original = originalOf(runtime as ImagePathifyRuntime);
    const binding = Reflect.get(original, "typertRemote") as {
      service: object;
      serviceKey: string;
      namespace: string;
    };
    expect(binding.service).toBe(original);
    expect(binding.serviceKey).toBe("imagePathify");
    expect(binding.namespace).toBe("imagePathify");
  });
});
