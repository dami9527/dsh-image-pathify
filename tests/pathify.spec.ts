import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { AttachmentId } from "@deepseek-ai/dsh-attachment";
import type {
  ImageAttachmentRef,
  StoredImageAttachment,
} from "@deepseek-ai/dsh-attachment";
import LlmRuntime, {
  createMessage,
  GenerateOptions,
  LlmAdapter,
  LlmResolvedModelInfo,
  StreamChunk,
} from "@deepseek-ai/dsh-llm";
import * as plugin from "../src/index.ts";

const contexts: Context[] = [];
const savedHome = process.env.DSH_HOME;

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((ctx) => ctx.fiber.dispose()));
  if (savedHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedHome;
});

const FINISH: StreamChunk = { type: "finish", reason: { kind: "stop" } };

/** One image block the durable message carries. */
function imageBlock(attachmentId = `sha256:${"a".repeat(64)}`) {
  return {
    type: "image" as const,
    attachment: {
      attachmentId: AttachmentId(attachmentId),
      mediaType: "image/png" as const,
      bytes: 1,
      width: 1,
      height: 1,
    },
  };
}

function imageMessage() {
  return createMessage({
    role: "user",
    content: [{ type: "text", text: "what is in" }, imageBlock()],
    source: { kind: "user" },
  });
}

function pathMessage() {
  return createMessage({
    role: "user",
    content: [
      {
        type: "text",
        text: "这张图片是什么？\n/Users/dami/Pictures/ikun.png",
      },
    ],
    source: { kind: "user" },
  });
}

function catalogTools() {
  return [
    {
      name: "analyze_image",
      description: "analyze",
      parameters: {},
    },
    { name: "read_image", description: "read", parameters: {} },
    { name: "bash", description: "bash", parameters: {} },
  ];
}

/** Records the exact options the adapter received. */
class RecordingAdapter extends LlmAdapter {
  lastOptions: GenerateOptions | undefined;

  constructor(
    private readonly modalities: Record<string, readonly ("text" | "image")[]>,
  ) {
    super();
  }

  override resolveModel(
    provider: string,
    model: string,
  ): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({
      provider,
      id: model,
      name: model,
      ...(this.modalities[model] === undefined
        ? {}
        : { inputModalities: this.modalities[model] }),
    });
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.lastOptions = options;
    yield FINISH;
  }
}

async function drain(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _chunk of stream) {
    /* drain */
  }
}

interface SetupOptions {
  modalities?: Record<string, readonly ("text" | "image")[]>;
  attachments?: {
    root?: string;
    readImage?: () => Promise<StoredImageAttachment>;
    imagePath?: (ref: ImageAttachmentRef) => string;
  };
  config?: Record<string, unknown>;
}

interface SetupResult {
  ctx: Context;
  adapter: RecordingAdapter;
}

async function setup(options: SetupOptions = {}): Promise<SetupResult> {
  const ctx = new Context();
  contexts.push(ctx);
  await ctx.plugin(LlmRuntime);
  if (options.attachments !== undefined) {
    ctx.provide("attachments", {
      readImage: () => Promise.reject(new Error("unreachable in this test")),
      ...options.attachments,
    } as never);
  }
  const adapter = new RecordingAdapter(
    options.modalities ?? {
      "text-model": ["text"],
      "vision-model": ["text", "image"],
    },
  );
  ctx.llm.registerAdapter(["route"], adapter);
  await ctx.plugin(plugin, {
    models: [],
    relaxAdmission: true,
    ...options.config,
  });
  return { ctx, adapter };
}

describe("dsh-image-pathify", () => {
  it("keeps the Loader-safe namespace plugin shape", () => {
    expect("default" in plugin).toBe(false);
    expect(plugin.name).toBe("dsh-image-pathify");
    expect(plugin.inject).toEqual(["llm"]);
    expect(typeof plugin.apply).toBe("function");
    expect(plugin.Config).toBeDefined();
  });

  it("rewrites image blocks to durable paths for a text-only model at dispatch", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
    });
    const message = imageMessage();
    const original = structuredClone(message.content);

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [message],
      }),
    );

    // The durable message keeps its image block (the Web UI renders it); the
    // adapter-facing request carries the vision-skill path text instead.
    expect(message.content).toEqual(original);
    expect(adapter.lastOptions?.messages[0]?.content).toEqual([
      { type: "text", text: "what is in" },
      {
        type: "text",
        text: `Saved attachments: /attachments/objects/aa/${"a".repeat(64)}`,
      },
    ]);
  });

  it("ignores a leftover prefix in stored config", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
      config: { prefix: "PATH: " },
    });

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [imageMessage()],
      }),
    );

    expect(adapter.lastOptions?.messages[0]?.content[1]).toEqual({
      type: "text",
      text: `Saved attachments: /attachments/objects/aa/${"a".repeat(64)}`,
    });
  });

  it("passes image blocks through untouched for a vision model", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text", "image"] },
    });
    const message = imageMessage();

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [message],
      }),
    );

    expect(adapter.lastOptions?.messages).toEqual([message]);
  });

  it("leaves the request unchanged when no attachment store exists", async () => {
    const { ctx, adapter } = await setup({ modalities: { model: ["text"] } });
    const message = imageMessage();

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [message],
      }),
    );

    expect(adapter.lastOptions?.messages).toEqual([message]);
  });

  it("materializes a readable file for stores without a local root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-image-pathify-"));
    process.env.DSH_HOME = dir;
    const bytes = new Uint8Array([1, 2, 3]);
    const { ctx, adapter } = await setup({
      attachments: {
        readImage: () =>
          Promise.resolve({
            ref: imageBlock().attachment,
            data: bytes,
          }),
      },
      modalities: { model: ["text"] },
    });
    try {
      await drain(
        ctx.llm.stream({
          provider: "route",
          model: "model",
          messages: [imageMessage()],
        }),
      );
      const text = adapter.lastOptions?.messages[0]?.content[1];
      expect(text?.type).toBe("text");
      const path = (text as { text: string }).text.slice(
        "Saved attachments: ".length,
      );
      expect(path).toBe(
        join(dir, "attachments", "vision-paths", `${"a".repeat(64)}.png`),
      );
      expect(Array.from(await readFile(path))).toEqual([1, 2, 3]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps non-image blocks and message identity in the rewritten request", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
    });
    const message = imageMessage();

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [message],
      }),
    );

    const rewritten = adapter.lastOptions?.messages[0];
    expect(rewritten?.id).toBe(message.id);
    expect(rewritten?.role).toBe("user");
    expect(rewritten?.source).toEqual(message.source);
  });

  it("prefers imagePath() over a local root when the store publishes both", async () => {
    const { ctx, adapter } = await setup({
      attachments: {
        root: "/attachments",
        imagePath: (ref) => `/canonical/${String(ref.attachmentId)}`,
      },
      modalities: { model: ["text"] },
    });

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [imageMessage()],
      }),
    );

    expect(adapter.lastOptions?.messages[0]?.content).toEqual([
      { type: "text", text: "what is in" },
      {
        type: "text",
        text: `Saved attachments: /canonical/sha256:${"a".repeat(64)}`,
      },
    ]);
  });

  it("rewrites multiple image blocks in order", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
    });
    const message = createMessage({
      role: "user",
      content: [
        { type: "text", text: "compare" },
        imageBlock(`sha256:${"a".repeat(64)}`),
        imageBlock(`sha256:${"b".repeat(64)}`),
      ],
      source: { kind: "user" },
    });

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [message],
      }),
    );

    expect(adapter.lastOptions?.messages[0]?.content).toEqual([
      { type: "text", text: "compare" },
      {
        type: "text",
        text: `Saved attachments: /attachments/objects/aa/${"a".repeat(64)}`,
      },
      {
        type: "text",
        text: `Saved attachments: /attachments/objects/bb/${"b".repeat(64)}`,
      },
    ]);
  });

  it("materializes when a root is present but the id is not content-addressed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-image-pathify-"));
    process.env.DSH_HOME = dir;
    const bytes = new Uint8Array([4, 5, 6]);
    const { ctx, adapter } = await setup({
      attachments: {
        root: "/attachments",
        readImage: () =>
          Promise.resolve({
            ref: imageBlock("opaque-id").attachment,
            data: bytes,
          }),
      },
      modalities: { model: ["text"] },
    });
    try {
      await drain(
        ctx.llm.stream({
          provider: "route",
          model: "model",
          messages: [
            createMessage({
              role: "user",
              content: [
                { type: "text", text: "what is in" },
                imageBlock("opaque-id"),
              ],
              source: { kind: "user" },
            }),
          ],
        }),
      );
      const text = adapter.lastOptions?.messages[0]?.content[1];
      expect(text?.type).toBe("text");
      const path = (text as { text: string }).text.slice(
        "Saved attachments: ".length,
      );
      expect(path).toBe(
        join(dir, "attachments", "vision-paths", "opaque_id.png"),
      );
      expect(Array.from(await readFile(path))).toEqual([4, 5, 6]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reuses an already materialized fallback file without reading the store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-image-pathify-"));
    process.env.DSH_HOME = dir;
    const file = join(
      dir,
      "attachments",
      "vision-paths",
      `${"a".repeat(64)}.png`,
    );
    await mkdir(join(dir, "attachments", "vision-paths"), { recursive: true });
    await writeFile(file, Buffer.from([9, 9, 9]));
    let reads = 0;
    const { ctx, adapter } = await setup({
      attachments: {
        readImage: () => {
          reads += 1;
          return Promise.resolve({
            ref: imageBlock().attachment,
            data: new Uint8Array([1, 2, 3]),
          });
        },
      },
      modalities: { model: ["text"] },
    });
    try {
      await drain(
        ctx.llm.stream({
          provider: "route",
          model: "model",
          messages: [imageMessage()],
        }),
      );
      expect(reads).toBe(0);
      const text = adapter.lastOptions?.messages[0]?.content[1];
      expect(text).toEqual({
        type: "text",
        text: `Saved attachments: ${file}`,
      });
      expect(Array.from(await readFile(file))).toEqual([9, 9, 9]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("drops read_image from a text-only request that only names a local path", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
    });
    const system = plugin.visionPromptText();
    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [pathMessage()],
        tools: catalogTools(),
        system,
      }),
    );
    expect(adapter.lastOptions?.tools?.map((tool) => tool.name)).toEqual([
      "analyze_image",
      "bash",
    ]);
    expect(adapter.lastOptions?.system).toContain("analyze_image");
  });

  it("drops analyze_image from a vision request that only names a local path", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text", "image"] },
    });
    const system = `persona\n\n${plugin.visionPromptText()}\n\nfooter`;
    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [pathMessage()],
        tools: catalogTools(),
        system,
      }),
    );
    expect(adapter.lastOptions?.tools?.map((tool) => tool.name)).toEqual([
      "read_image",
      "bash",
    ]);
    expect(adapter.lastOptions?.system).not.toContain("analyze_image");
    expect(adapter.lastOptions?.system).toContain("persona");
  });
});

describe("admission shim", () => {
  it("reports unknown modalities for a text-only model while a store exists", async () => {
    const { ctx } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
    });
    const info = await ctx.llm.resolveModelInfo("route", "model");
    expect(info.inputModalities).toBeUndefined();
  });

  it("keeps declared modalities for vision models", async () => {
    const { ctx } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text", "image"] },
    });
    const info = await ctx.llm.resolveModelInfo("route", "model");
    expect(info.inputModalities).toEqual(["text", "image"]);
  });

  it("keeps declared modalities when no attachment store exists", async () => {
    const { ctx } = await setup({ modalities: { model: ["text"] } });
    const info = await ctx.llm.resolveModelInfo("route", "model");
    expect(info.inputModalities).toEqual(["text"]);
  });

  it("does not patch resolveModelInfo when relaxAdmission is false", async () => {
    const { ctx, adapter } = await setup({
      attachments: { root: "/attachments" },
      modalities: { model: ["text"] },
      config: { relaxAdmission: false },
    });
    expect(
      (await ctx.llm.resolveModelInfo("route", "model")).inputModalities,
    ).toEqual(["text"]);

    await drain(
      ctx.llm.stream({
        provider: "route",
        model: "model",
        messages: [imageMessage()],
      }),
    );
    expect(adapter.lastOptions?.messages[0]?.content[1]).toEqual({
      type: "text",
      text: `Saved attachments: /attachments/objects/aa/${"a".repeat(64)}`,
    });
  });

  it("respects the allowlist", async () => {
    const { ctx } = await setup({
      attachments: { root: "/attachments" },
      modalities: { other: ["text"], model: ["text"] },
      config: { models: [{ provider: "route", model: "model" }] },
    });
    expect(
      (await ctx.llm.resolveModelInfo("route", "model")).inputModalities,
    ).toBeUndefined();
    expect(
      (await ctx.llm.resolveModelInfo("route", "other")).inputModalities,
    ).toEqual(["text"]);
  });

  it("restores the original method on disposal", async () => {
    const ctx = new Context();
    contexts.push(ctx);
    await ctx.plugin(LlmRuntime);
    ctx.provide("attachments", { root: "/attachments" } as never);
    ctx.llm.registerAdapter(
      ["route"],
      new RecordingAdapter({ model: ["text"] }),
    );
    const fiber = await ctx.plugin(plugin, {
      models: [],
      relaxAdmission: true,
    });
    expect(
      (await ctx.llm.resolveModelInfo("route", "model")).inputModalities,
    ).toBeUndefined();
    await fiber.dispose();
    expect(
      (await ctx.llm.resolveModelInfo("route", "model")).inputModalities,
    ).toEqual(["text"]);
  });
});
