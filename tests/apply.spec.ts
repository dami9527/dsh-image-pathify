import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import type { Config } from "../src/config.ts";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_PREFIX,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "../src/defaults.ts";
import * as plugin from "../src/index.ts";

const contexts: Context[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()));
});

interface AnalyzeTool {
  name: string;
  execute(
    args: { image?: string; prompt?: string },
    exec: { signal: AbortSignal },
  ): Promise<unknown>;
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

describe("analyze_image live settings", () => {
  it("picks up the API key after tools injects before credentials", async () => {
    const ctx = new Context();
    contexts.push(ctx);

    let tool: AnalyzeTool | undefined;
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    ctx.provide("tools", {
      register(definition: AnalyzeTool) {
        if (definition.name === "analyze_image") tool = definition;
        return () => {};
      },
    });

    await ctx.plugin(plugin, {});
    expect(tool).toBeDefined();

    await expect(
      tool!.execute(
        { image: "https://example.com/a.png" },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow(/not configured/);

    ctx.provide("credentials", {
      resolve: async (ref: string) =>
        ref === DEFAULT_API_KEY_ENV
          ? { value: "sk-test-key", source: "file" }
          : undefined,
    });
    ctx.provide("settings", {
      register(
        _ns: unknown,
        _schema: unknown,
        options?: { base?: Partial<Config> },
      ) {
        let value = sample({
          ...options?.base,
          visionModel: "qwen-vl-plus",
        });
        return {
          get: () => value,
          watch: () => () => {},
          update: async (patch: Partial<Config>) => {
            value = { ...value, ...patch };
          },
        };
      },
    });

    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "a bird" } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    await expect(
      tool!.execute(
        { image: "https://example.com/a.png", prompt: "what is this?" },
        { signal: new AbortController().signal },
      ),
    ).resolves.toBe("a bird");

    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      | [input: string, init?: RequestInit]
      | undefined;
    expect(fetchCall).toBeDefined();
    expect(fetchCall![1]?.headers).toMatchObject({
      Authorization: "Bearer sk-test-key",
    });
  });
});
