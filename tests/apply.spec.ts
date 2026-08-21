import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context, symbols } from "@deepseek-ai/cordis";
import type { Config } from "../src/config.ts";
import {
  DEFAULT_API_KEY_ENV,
  DEFAULT_MAX_TOKENS,
  DEFAULT_VISION_BASE_URL,
  DEFAULT_VISION_MODEL,
} from "../src/defaults.ts";
import * as plugin from "../src/index.ts";
import type { ImagePathifyRuntime } from "../src/runtime.ts";

const contexts: Context[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()));
});

/** The unproxied service original (cordis caller-tracking may wrap instances). */
function originalOf(service: object): object {
  const original = Reflect.get(service, symbols.original) as object | undefined;
  return original ?? service;
}

interface AnalyzeTool {
  name: string;
  execute(
    args: { image?: unknown; images?: unknown; prompt?: string },
    exec: { signal: AbortSignal },
  ): Promise<unknown>;
}

function sample(overrides: Partial<Config> = {}): Config {
  return {
    models: [],
    relaxAdmission: true,
    apiKeyEnv: DEFAULT_API_KEY_ENV,
    visionModel: DEFAULT_VISION_MODEL,
    visionBaseUrl: DEFAULT_VISION_BASE_URL,
    disableThinking: true,
    maxTokens: DEFAULT_MAX_TOKENS,
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
          visionModel: DEFAULT_VISION_MODEL,
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

  it("analyzes several images in one call", async () => {
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
        const value = sample({
          ...options?.base,
          visionModel: DEFAULT_VISION_MODEL,
        });
        return {
          get: () => value,
          watch: () => () => {},
          update: async () => {},
        };
      },
    });

    await ctx.plugin(plugin, {});
    expect(tool).toBeDefined();

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchImpl);

    const text = await tool!.execute(
      {
        images: ["https://example.com/a.png", "https://example.com/b.png"],
        prompt: "分别有什么?",
      },
      { signal: new AbortController().signal },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(text)).toContain("Images in order:");
    expect(String(text)).toContain("1. https://example.com/a.png");
    expect(String(text)).toContain("2. https://example.com/b.png");
    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      | [input: string, init?: RequestInit]
      | undefined;
    const body = JSON.parse(String(fetchCall![1]?.body)) as {
      max_tokens: number;
      messages: {
        content: { type: string; image_url?: { url: string }; text?: string }[];
      }[];
    };
    const parts = body.messages[0]?.content ?? [];
    expect(parts.filter((part) => part.type === "image_url")).toHaveLength(2);
    expect(parts.at(-1)?.text).toContain("以下共 2 张图片");
    expect(body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
  });

  it("uses the configured max_tokens", async () => {
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
        const value = sample({
          ...options?.base,
          maxTokens: 4096,
        });
        return {
          get: () => value,
          watch: () => () => {},
          update: async () => {},
        };
      },
    });

    await ctx.plugin(plugin, {});
    expect(tool).toBeDefined();

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchImpl);

    await tool!.execute(
      { image: "https://example.com/a.png" },
      { signal: new AbortController().signal },
    );
    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      | [input: string, init?: RequestInit]
      | undefined;
    const body = JSON.parse(String(fetchCall![1]?.body)) as {
      max_tokens: number;
    };
    expect(body.max_tokens).toBe(4096);
  });
});

describe("upgrade command profile", () => {
  async function bootWithUpdateProbe(
    extras: Record<string, unknown> = {},
    setup?: (ctx: Context) => void,
  ): Promise<ImagePathifyRuntime> {
    const ctx = new Context();
    contexts.push(ctx);
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    ctx.provide("settings", {
      register() {
        const value = sample();
        return {
          get: () => value,
          watch: () => () => {},
          update: async () => {},
        };
      },
    });
    ctx.provide("typert", {
      register() {
        return () => {};
      },
    });
    for (const [name, service] of Object.entries(extras)) {
      ctx.provide(name, service);
    }
    setup?.(ctx);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ "dist-tags": { latest: "9.9.9" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    await ctx.plugin(plugin, {});
    return originalOf(
      ctx.get("imagePathify") as ImagePathifyRuntime,
    ) as ImagePathifyRuntime;
  }

  it("defaults the copied command to the web profile", async () => {
    const runtime = await bootWithUpdateProbe();
    await expect(runtime.getUpdate()).resolves.toMatchObject({
      command: "dsh plugin --profile web add dsh-image-pathify@9.9.9",
    });
  });

  it("pins the copied command to desktopProfiles.current.name", async () => {
    const runtime = await bootWithUpdateProbe({
      desktopProfiles: {
        current: { name: "desktop", dir: "/tmp/desktop" },
      },
    });
    await expect(runtime.getUpdate()).resolves.toMatchObject({
      command: "dsh plugin --profile desktop add dsh-image-pathify@9.9.9",
    });
  });

  it("pins the copied command to Loader baseUrl when Desktop is absent", async () => {
    const runtime = await bootWithUpdateProbe({}, (ctx) => {
      ctx.baseUrl = `${pathToFileURL(join("/tmp/dsh-home/profiles", "mybot")).href}/`;
    });
    await expect(runtime.getUpdate()).resolves.toMatchObject({
      command: "dsh plugin --profile mybot add dsh-image-pathify@9.9.9",
    });
  });

  it("prefers desktopProfiles over Loader baseUrl", async () => {
    const runtime = await bootWithUpdateProbe(
      {
        desktopProfiles: {
          current: { name: "desktop", dir: "/tmp/desktop" },
        },
      },
      (ctx) => {
        ctx.baseUrl = `${pathToFileURL(join("/tmp/dsh-home/profiles", "mybot")).href}/`;
      },
    );
    await expect(runtime.getUpdate()).resolves.toMatchObject({
      command: "dsh plugin --profile desktop add dsh-image-pathify@9.9.9",
    });
  });
});
