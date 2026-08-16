import { describe, expect, it, vi } from "vitest";
import {
  analyzeImage,
  isRemoteImageUrl,
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
      | [input: string, init?: RequestInit]
      | undefined;
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
      | [input: string, init?: RequestInit]
      | undefined;
    expect(fetchCall).toBeDefined();
    const body = JSON.parse(String(fetchCall![1]?.body)) as {
      messages: { content: { image_url?: { url: string } }[] }[];
    };
    expect(body.messages[0]?.content[0]?.image_url?.url).toBe(
      `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`,
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
});
