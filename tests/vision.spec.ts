import { describe, expect, it, vi } from "vitest";
import {
  analyzeImage,
  analyzeImages,
  formatMultiImageResult,
  isRemoteImageUrl,
  multiImagePrompt,
  shouldDisableThinking,
  DEFAULT_VISION_PROMPT,
} from "../src/vision.ts";

describe("isRemoteImageUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isRemoteImageUrl("https://example.com/a.png")).toBe(true);
    expect(isRemoteImageUrl("http://example.com/a.png")).toBe(true);
  });

  it("rejects local paths", () => {
    expect(isRemoteImageUrl("/tmp/a.png")).toBe(false);
    expect(isRemoteImageUrl("C:\\\\img.png")).toBe(false);
  });
});

describe("analyzeImage", () => {
  it("throws when the API key or model is missing", async () => {
    await expect(
      analyzeImage({
        apiKey: "  ",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image: "https://example.com/a.png",
        prompt: DEFAULT_VISION_PROMPT,
      }),
    ).rejects.toThrow(/not configured/);
    await expect(
      analyzeImage({
        apiKey: "sk-test",
        model: "",
        baseUrl: "https://example.com/v1",
        image: "https://example.com/a.png",
        prompt: DEFAULT_VISION_PROMPT,
      }),
    ).rejects.toThrow(/not configured/);
  });

  it("posts a remote URL without reading a file", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "a cat" } }],
          }),
          { status: 200 },
        ),
    );
    const readFile = vi.fn(async () => {
      throw new Error("should not read");
    });
    const text = await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image: "https://cdn.example/a.png",
        prompt: "what is this?",
      },
      { fetch: fetchImpl as unknown as typeof fetch, readFile },
    );
    expect(text).toBe("a cat");
    expect(readFile).not.toHaveBeenCalled();
    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      [input: string, init?: RequestInit] | undefined;
    expect(fetchCall).toBeDefined();
    const [url, init] = fetchCall!;
    expect(url).toBe("https://example.com/v1/chat/completions");
    const body = JSON.parse(String((init as RequestInit).body)) as {
      model: string;
      messages: {
        content: { type: string; image_url?: { url: string }; text?: string }[];
      }[];
    };
    expect(body.model).toBe("qwen-vl-plus");
    expect(body.messages[0]?.content).toEqual([
      { type: "image_url", image_url: { url: "https://cdn.example/a.png" } },
      { type: "text", text: "what is this?" },
    ]);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer sk-test",
    });
  });

  it("encodes a local file as a data URL", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "red square" } }],
          }),
          { status: 200 },
        ),
    );
    const bytes = new Uint8Array([1, 2, 3]);
    const text = await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1/",
        image: "/tmp/shot.png",
        prompt: DEFAULT_VISION_PROMPT,
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => bytes,
      },
    );
    expect(text).toBe("red square");
    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      [input: string, init?: RequestInit] | undefined;
    expect(fetchCall).toBeDefined();
    const body = JSON.parse(String(fetchCall![1]?.body)) as {
      messages: { content: { image_url?: { url: string } }[] }[];
    };
    expect(body.messages[0]?.content[0]?.image_url?.url).toBe(
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
    );
  });

  it.each([
    ["/tmp/photo.jpg", "jpeg"],
    ["/tmp/scan.tif", "tiff"],
    ["/tmp/scan.tiff", "tiff"],
    ["/tmp/phone.heic", "heic"],
    ["/tmp/phone.heif", "heif"],
    ["/tmp/shot.avif", "avif"],
  ] as const)("encodes %s as image/%s", async (image, subtype) => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    const bytes = new Uint8Array([9, 8, 7]);
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image,
        prompt: DEFAULT_VISION_PROMPT,
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => bytes,
      },
    );
    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      [input: string, init?: RequestInit] | undefined;
    const body = JSON.parse(String(fetchCall![1]?.body)) as {
      messages: { content: { image_url?: { url: string } }[] }[];
    };
    expect(body.messages[0]?.content[0]?.image_url?.url).toBe(
      `data:image/${subtype};base64,${Buffer.from(bytes).toString("base64")}`,
    );
  });

  it("surfaces a non-2xx API body", async () => {
    await expect(
      analyzeImage(
        {
          apiKey: "sk-test",
          model: "qwen-vl-plus",
          baseUrl: "https://example.com/v1",
          image: "https://example.com/a.png",
          prompt: "x",
        },
        {
          fetch: async () => new Response("nope", { status: 401 }),
          readFile: async () => new Uint8Array(),
        },
      ),
    ).rejects.toThrow(/Vision API 401/);
  });

  it("reads reasoning_content when message.content is empty", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  reasoning_content: "a yellow bird",
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const text = await analyzeImage(
      {
        apiKey: "sk-test",
        model: "deepseek-v4-flash-vision-exp",
        baseUrl: "https://api.deepseek.com",
        image: "https://example.com/a.png",
        prompt: "x",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    expect(text).toBe("a yellow bird");
  });

  it("flattens array content parts", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    { type: "text", text: "hello " },
                    { type: "text", text: "world" },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const text = await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image: "https://example.com/a.png",
        prompt: "x",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    expect(text).toBe("hello world");
  });

  it("disables thinking on DeepSeek so max_tokens is not spent on reasoning", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "deepseek-v4-flash-vision-exp",
        baseUrl: "https://api.deepseek.com",
        image: "https://example.com/a.png",
        prompt: "x",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { thinking?: { type: string } };
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("does not send thinking for non-DeepSeek endpoints", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        image: "https://example.com/a.png",
        prompt: "x",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { thinking?: unknown };
    expect(body.thinking).toBeUndefined();
  });

  it("sniffs PNG magic bytes on extensionless attachment paths", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image:
          "/Users/dami/.dsh/attachments/v1/objects/d0/d04f27c45064da7f6b67bebeda94934118fc52de77059884b44669ddd8cec2c4",
        prompt: "x",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => png,
      },
    );
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { messages: { content: { image_url?: { url: string } }[] }[] };
    expect(body.messages[0]?.content[0]?.image_url?.url).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("throws when both content and reasoning_content are empty", async () => {
    await expect(
      analyzeImage(
        {
          apiKey: "sk-test",
          model: "qwen-vl-plus",
          baseUrl: "https://example.com/v1",
          image: "https://example.com/a.png",
          prompt: "x",
        },
        {
          fetch: async () =>
            new Response(
              JSON.stringify({
                choices: [
                  {
                    finish_reason: "length",
                    message: { content: "", reasoning_content: "" },
                  },
                ],
              }),
              { status: 200 },
            ),
          readFile: async () => new Uint8Array(),
        },
      ),
    ).rejects.toThrow(/empty message.*finish_reason=length/);
  });
});

describe("analyzeImages", () => {
  it("posts every image in a single completion", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "图1 cat\n图2 dog\n图3 bird" } }],
          }),
          { status: 200 },
        ),
    );
    const text = await analyzeImages(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        images: [
          "https://cdn.example/a.png",
          "https://cdn.example/b.png",
          "https://cdn.example/c.png",
        ],
        prompt: "分别有什么?",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => {
          throw new Error("should not read");
        },
      },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const fetchCall = fetchImpl.mock.calls[0] as unknown as
      [input: string, init?: RequestInit] | undefined;
    const body = JSON.parse(String(fetchCall![1]?.body)) as {
      max_tokens?: number;
      messages: {
        content: { type: string; image_url?: { url: string }; text?: string }[];
      }[];
    };
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[0]?.content).toEqual([
      { type: "image_url", image_url: { url: "https://cdn.example/a.png" } },
      { type: "image_url", image_url: { url: "https://cdn.example/b.png" } },
      { type: "image_url", image_url: { url: "https://cdn.example/c.png" } },
      { type: "text", text: multiImagePrompt(3, "分别有什么?") },
    ]);
    expect(text).toBe(
      formatMultiImageResult(
        [
          "https://cdn.example/a.png",
          "https://cdn.example/b.png",
          "https://cdn.example/c.png",
        ],
        "图1 cat\n图2 dog\n图3 bird",
      ),
    );
  });

  it("falls back to a single-image request for one path", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "a cat" } }],
          }),
          { status: 200 },
        ),
    );
    const text = await analyzeImages(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        images: ["https://cdn.example/a.png"],
        prompt: "what is this?",
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    expect(text).toBe("a cat");
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { max_tokens?: number; messages: { content: unknown[] }[] };
    expect(body.max_tokens).toBeUndefined();
    expect(body.messages[0]?.content).toHaveLength(2);
  });

  it("omits max_tokens when the cap is 0", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image: "https://cdn.example/a.png",
        prompt: "x",
        maxTokens: 0,
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { max_tokens?: number };
    expect(body.max_tokens).toBeUndefined();
  });

  it("keeps thinking enabled on DeepSeek when disableThinking is false", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "deepseek-v4-flash-vision-exp",
        baseUrl: "https://api.deepseek.com",
        image: "https://example.com/a.png",
        prompt: "x",
        disableThinking: false,
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { thinking?: unknown };
    expect(body.thinking).toBeUndefined();
  });

  it("honors a maxTokens override", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
          }),
          { status: 200 },
        ),
    );
    await analyzeImage(
      {
        apiKey: "sk-test",
        model: "qwen-vl-plus",
        baseUrl: "https://example.com/v1",
        image: "https://cdn.example/a.png",
        prompt: "x",
        maxTokens: 2048,
      },
      {
        fetch: fetchImpl as unknown as typeof fetch,
        readFile: async () => new Uint8Array(),
      },
    );
    const body = JSON.parse(
      String(
        (
          fetchImpl.mock.calls[0] as unknown as [
            input: string,
            init?: RequestInit,
          ]
        )[1]?.body,
      ),
    ) as { max_tokens: number };
    expect(body.max_tokens).toBe(2048);
  });
});

describe("multiImagePrompt", () => {
  it("tells the vision model every image is attached", () => {
    const text = multiImagePrompt(3, "分别有什么?");
    expect(text).toContain("以下共 3 张图片");
    expect(text).toContain("不要说只能看到一张图");
    expect(text).toContain("分别有什么?");
  });
});

describe("formatMultiImageResult", () => {
  it("prefixes the reply with the attachment order", () => {
    expect(
      formatMultiImageResult(["/tmp/a.png", "/tmp/b.png"], "图1 cat"),
    ).toBe("Images in order:\n1. /tmp/a.png\n2. /tmp/b.png\n\n图1 cat");
  });
});

describe("shouldDisableThinking", () => {
  it("detects DeepSeek model ids and official hosts", () => {
    expect(
      shouldDisableThinking(
        "deepseek-v4-flash-vision-exp",
        "https://example.com/v1",
      ),
    ).toBe(true);
    expect(
      shouldDisableThinking("qwen-vl-plus", "https://api.deepseek.com"),
    ).toBe(true);
    expect(
      shouldDisableThinking(
        "qwen-vl-plus",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
      ),
    ).toBe(false);
  });
});
