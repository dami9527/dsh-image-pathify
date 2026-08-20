import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import {
  ANALYZE_IMAGE_TOOL,
  READ_IMAGE_TOOL,
  VISION_PROMPT_NAME,
  analyzeImageDenyReason,
  analyzeImagePreExecute,
  assembleVisionPolicy,
  filterDispatchForRoute,
  readImageDenyReason,
  readImagePreExecute,
  requestHeaderRoute,
  routeAcceptsImage,
  routedModel,
  stripAnalyzeImage,
  visionPromptText,
  visionToolsPreExecute,
} from "../src/policy.ts";

describe("visionPromptText", () => {
  it("names the fixed Saved attachments prefix", () => {
    const text = visionPromptText();
    expect(text).toContain("Saved attachments: ");
    expect(text).toContain("analyze_image");
    expect(text).toContain("read_image");
    expect(text).toContain("images array");
    expect(text).toContain("Do not call analyze_image once per image");
    expect(text).toContain("file://");
    expect(text).toContain(".png");
    expect(text).toContain(".heic");
    expect(text).toContain(".tiff");
    expect(text).not.toContain("unless");
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

describe("stripAnalyzeImage", () => {
  it("drops the vision section and analyze_image schema, keeping other entries", () => {
    const stripped = stripAnalyzeImage({
      sections: [
        { name: "persona", text: "hi" },
        { name: VISION_PROMPT_NAME, text: "call analyze_image" },
      ],
      tools: [{ name: "read" }, { name: ANALYZE_IMAGE_TOOL }, { name: "bash" }],
      variables: { a: "1" },
    });
    expect(stripped.sections.map((section) => section.name)).toEqual([
      "persona",
    ]);
    expect(stripped.tools.map((tool) => tool.name)).toEqual(["read", "bash"]);
    expect(stripped.variables).toEqual({ a: "1" });
  });
});

describe("assembleVisionPolicy", () => {
  const assembly = {
    sections: [{ name: VISION_PROMPT_NAME }],
    tools: [
      { name: ANALYZE_IMAGE_TOOL },
      { name: READ_IMAGE_TOOL },
      { name: "bash" },
    ],
  };

  it("leaves both image tools when no request header exists yet", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    });
    const result = await assembleVisionPolicy(
      ctx,
      assembly,
      { agent: { options: { provider: "p", model: "vision" } } },
      async () => assembly,
    );
    expect(result).toEqual(assembly);
  });

  it("strips analyze_image once a vision request header exists", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    });
    const result = await assembleVisionPolicy(
      ctx,
      assembly,
      {
        agent: {
          session: {
            requestHeader: () => ({
              config: { provider: "p", model: "vision" },
            }),
          },
          options: { provider: "other", model: "text-only" },
        },
      },
      async () => assembly,
    );
    expect(result.sections).toEqual([]);
    expect(result.tools.map((tool) => tool.name)).toEqual([
      READ_IMAGE_TOOL,
      "bash",
    ]);
  });

  it("strips read_image once a text-only request header exists", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    const result = await assembleVisionPolicy(
      ctx,
      assembly,
      {
        agent: {
          session: {
            requestHeader: () => ({
              config: { provider: "p", model: "m" },
            }),
          },
        },
      },
      async () => assembly,
    );
    expect(result.sections).toEqual([{ name: VISION_PROMPT_NAME }]);
    expect(result.tools.map((tool) => tool.name)).toEqual([
      ANALYZE_IMAGE_TOOL,
      "bash",
    ]);
  });

  it("keeps both tools when the route is unknown", async () => {
    const ctx = new Context();
    const result = await assembleVisionPolicy(
      ctx,
      assembly,
      {},
      async () => assembly,
    );
    expect(result).toEqual(assembly);
  });
});

describe("filterDispatchForRoute", () => {
  const prompt = visionPromptText();
  const request = {
    tools: [
      { name: ANALYZE_IMAGE_TOOL },
      { name: READ_IMAGE_TOOL },
      { name: "bash" },
    ],
    system: `persona\n\n${prompt}\n\nfooter`,
  };

  it("drops read_image for a text-only dispatch and keeps the prompt", () => {
    const filtered = filterDispatchForRoute(request, false);
    expect(filtered.tools?.map((tool) => tool.name)).toEqual([
      ANALYZE_IMAGE_TOOL,
      "bash",
    ]);
    expect(filtered.system).toContain("analyze_image");
  });

  it("drops analyze_image and its prompt for a vision dispatch", () => {
    const filtered = filterDispatchForRoute(request, true);
    expect(filtered.tools?.map((tool) => tool.name)).toEqual([
      READ_IMAGE_TOOL,
      "bash",
    ]);
    expect(filtered.system).not.toContain("analyze_image");
    expect(filtered.system).toContain("persona");
    expect(filtered.system).toContain("footer");
  });

  it("returns the same object when nothing needs dropping", () => {
    const already = {
      tools: [{ name: "bash" }],
      system: "persona",
    };
    expect(filterDispatchForRoute(already, true)).toBe(already);
    expect(filterDispatchForRoute(already, false)).toBe(already);
  });
});

describe("requestHeaderRoute", () => {
  it("ignores agent.options when no header exists", () => {
    expect(
      requestHeaderRoute({ options: { provider: "p", model: "m" } }),
    ).toBeUndefined();
  });
});

describe("analyzeImagePreExecute", () => {
  it("delegates for any tool other than analyze_image", async () => {
    const ctx = new Context();
    const decision = await analyzeImagePreExecute(
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

  it("allows analyze_image on a text-only route", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    const decision = await analyzeImagePreExecute(
      ctx,
      {
        name: ANALYZE_IMAGE_TOOL,
        arguments: { image: "/tmp/a.png" },
        agent: { options: { provider: "p", model: "m" } },
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(decision).toEqual({ kind: "allow" });
  });

  it("denies analyze_image on a vision route", async () => {
    const ctx = new Context();
    ctx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    });
    const decision = await analyzeImagePreExecute(
      ctx,
      {
        name: ANALYZE_IMAGE_TOOL,
        arguments: { image: "/tmp/a.png" },
        agent: { options: { provider: "p", model: "vision" } },
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(decision.kind).toBe("deny");
    if (decision.kind === "deny") {
      expect(decision.reason).toBe(analyzeImageDenyReason());
    }
  });
});

describe("visionToolsPreExecute", () => {
  it("denies read_image on a text-only route and analyze_image on a vision route", async () => {
    const textCtx = new Context();
    textCtx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text"] }),
    });
    const readDenied = await visionToolsPreExecute(
      textCtx,
      {
        name: "read_image",
        arguments: { file_path: "/tmp/a.png" },
        agent: { options: { provider: "p", model: "m" } },
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(readDenied.kind).toBe("deny");

    const visionCtx = new Context();
    visionCtx.provide("llm", {
      resolveModelInfo: async () => ({ inputModalities: ["text", "image"] }),
    });
    const analyzeDenied = await visionToolsPreExecute(
      visionCtx,
      {
        name: ANALYZE_IMAGE_TOOL,
        arguments: {},
        agent: { options: { provider: "p", model: "vision" } },
        signal: new AbortController().signal,
      } as never,
      async () => ({ kind: "allow" }),
    );
    expect(analyzeDenied.kind).toBe("deny");
  });
});
