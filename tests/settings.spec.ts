import { afterEach, describe, expect, it, vi } from "vitest";
import { Context, symbols } from "@deepseek-ai/cordis";
import { DEFAULT_API_KEY_ENV } from "../src/defaults.ts";
import { ImagePathifyRuntime } from "../src/runtime.ts";
import { credentialRefName, resolveVisionApiKey } from "../src/credentials.ts";

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
    new ImagePathifyRuntime(ctx, async () => ({
      installedVersion: "0.1.0",
      latestVersion: "0.1.0",
      updateAvailable: false,
      command: "dsh plugin --profile web add dsh-image-pathify@0.1.0",
    }));
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

  it("returns the npm probe through getUpdate", async () => {
    const ctx = new Context();
    contexts.push(ctx);
    const status = {
      installedVersion: "0.1.0",
      latestVersion: "0.1.1",
      updateAvailable: true,
      command: "dsh plugin --profile web add dsh-image-pathify@0.1.1",
    };
    new ImagePathifyRuntime(ctx, async () => status);
    const runtime = originalOf(
      ctx.get("imagePathify") as ImagePathifyRuntime,
    ) as ImagePathifyRuntime;
    await expect(runtime.getUpdate()).resolves.toEqual(status);
  });
});
