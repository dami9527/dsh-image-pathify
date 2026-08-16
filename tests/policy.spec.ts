import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import {
  readImageDenyReason,
  readImagePreExecute,
  routeAcceptsImage,
  routedModel,
  visionPromptText,
} from "../src/policy.ts";

describe("visionPromptText", () => {
  it("embeds the live prefix", () => {
    const text = visionPromptText("PATH: ");
    expect(text).toContain("PATH: ");
    expect(text).toContain("analyze_image");
    expect(text).toContain("read_image");
  });
});

describe("readImageDenyReason", () => {
  it("names analyze_image and the requested path", () => {
    const reason = readImageDenyReason("/tmp/a.png");
    expect(reason).toContain("analyze_image");
    expect(reason).toContain("/tmp/a.png");
    expect(reason).not.toMatch(
      /read_image: the current model cannot accept image input.*read_image: the current/,
    );
  });
});

describe("routedModel", () => {
  it("prefers the request-header route", () => {
    expect(
      routedModel({
        session: {
          requestHeader: () => ({
            config: { provider: "p", model: "m" },
          }),
        },
        options: { provider: "other", model: "x" },
      }),
    ).toEqual({ provider: "p", model: "m" });
  });

  it("falls back to agent options", () => {
    expect(routedModel({ options: { provider: "p", model: "m" } })).toEqual({
      provider: "p",
      model: "m",
    });
  });
});

describe("routeAcceptsImage", () => {
  it("is false when the route is missing or the model is text-only", async () => {
    const ctx = new Context();
    expect(await routeAcceptsImage(ctx, undefined)).toBe(false);
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    expect(
      await routeAcceptsImage(ctx, {
        options: { provider: "p", model: "m" },
      }),
    ).toBe(false);
  });

  it("is true when the model declares image input", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    });
    expect(
      await routeAcceptsImage(ctx, {
        options: { provider: "p", model: "vision" },
      }),
    ).toBe(true);
  });
});

describe("readImagePreExecute", () => {
  it("delegates for any tool other than read_image", async () => {
    const ctx = new Context();
    const decision = await readImagePreExecute(
      ctx,
      {
        name: "read",
        arguments: {},
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(decision).toEqual({ kind: "allow" });
  });

  it("denies read_image on a text-only route", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    const decision = await readImagePreExecute(
      ctx,
      {
        name: "read_image",
        arguments: { file_path: "/tmp/a.png" },
        agent: { options: { provider: "p", model: "m" } },
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toContain("analyze_image");
      expect(decision.reason).toContain("/tmp/a.png");
    }
  });

  it("allows read_image on a vision route", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    });
    const decision = await readImagePreExecute(
      ctx,
      {
        name: "read_image",
        arguments: { file_path: "/tmp/a.png" },
        agent: { options: { provider: "p", model: "vision" } },
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(decision).toEqual({ kind: "allow" });
  });
});
