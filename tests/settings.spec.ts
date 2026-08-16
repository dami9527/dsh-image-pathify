import { afterEach, describe, expect, it } from "vitest";
import { Context, symbols } from "@deepseek-ai/cordis";
import {
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "../src/defaults.ts";
import { defaultPublicSettings } from "../src/contract.ts";
import { ImagePathifyRuntime } from "../src/runtime.ts";
import { applySettingsUpdate, toPublicSettings } from "../src/settings.ts";
import type { Config } from "../src/config.ts";

const contexts: Context[] = [];

afterEach(async () => {
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
    apiKey: "",
    visionModel: DEFAULT_VISION_MODEL,
    visionBaseUrl: DEFAULT_VISION_BASE_URL,
    ...overrides,
  };
}

describe("toPublicSettings", () => {
  it("does not return the full API key", () => {
    const publicSettings = toPublicSettings(
      sample({ apiKey: "sk-abcdefghijklmnopqrstuvwxyz" }),
    );
    expect(publicSettings.apiKeySet).toBe(true);
    expect(publicSettings.apiKeyPreview).toBe("wxyz");
    expect(JSON.stringify(publicSettings)).not.toContain(
      "sk-abcdefghijklmnopqrstuvwxyz",
    );
  });

  it("marks an empty key as unset", () => {
    expect(toPublicSettings(sample()).apiKeySet).toBe(false);
  });
});

describe("applySettingsUpdate", () => {
  it("keeps the secret when apiKey is omitted or empty", async () => {
    let stored = sample({ apiKey: "sk-keep" });
    const scope = {
      get: () => stored,
      watch: () => () => {},
      update: async (patch: Partial<Config>) => {
        stored = { ...stored, ...patch };
      },
    };
    await applySettingsUpdate(scope, { apiKey: "" });
    expect(stored.apiKey).toBe("sk-keep");
    await applySettingsUpdate(scope, { visionModel: "qwen-vl-plus" });
    expect(stored.apiKey).toBe("sk-keep");
    expect(stored.visionModel).toBe("qwen-vl-plus");
  });

  it("clears the secret when clearApiKey is set", async () => {
    let stored = sample({ apiKey: "sk-keep" });
    const scope = {
      get: () => stored,
      watch: () => () => {},
      update: async (patch: Partial<Config>) => {
        stored = { ...stored, ...patch };
      },
    };
    const next = await applySettingsUpdate(scope, { clearApiKey: true });
    expect(stored.apiKey).toBe("");
    expect(next.apiKeySet).toBe(false);
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
