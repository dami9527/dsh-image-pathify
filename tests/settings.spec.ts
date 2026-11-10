import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { DEFAULT_API_KEY_ENV } from "../src/defaults.ts";
import { credentialRefName, resolveVisionApiKey } from "../src/credentials.ts";

const contexts: Context[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()));
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
