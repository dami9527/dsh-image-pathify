import { describe, expect, it, vi } from "vitest";
import { defaultPublicSettings } from "../src/contract.ts";
import type { ImagePathifyPublicSettings } from "../src/contract.ts";
import {
  ImagePathifyCardController,
  type VisionCredentialFace,
} from "../src/client/card-form.ts";
import { DEFAULT_API_KEY_ENV, DEFAULT_PREFIX } from "../src/defaults.ts";

function sample(
  overrides: Partial<ImagePathifyPublicSettings> = {},
): ImagePathifyPublicSettings {
  return { ...defaultPublicSettings(), ...overrides };
}

function credentialsStub(
  initial = { configured: false, writable: true },
): VisionCredentialFace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  let configured = initial.configured;
  return {
    store,
    describe: async () => ({ configured, writable: initial.writable }),
    set: async (ref, value) => {
      store.set(ref, value);
      configured = value.length > 0;
    },
  };
}

describe("ImagePathifyCardController", () => {
  it("is clean after receive and hides the card before that", async () => {
    const credentials = credentialsStub({ configured: true, writable: true });
    const card = new ImagePathifyCardController(
      async () => sample(),
      credentials,
    );
    expect(card.snapshot.getSnapshot().available).toBe(false);
    card.receive(sample({ visionModel: "qwen-vl-max" }));
    await card.syncCredential();
    const state = card.snapshot.getSnapshot();
    expect(state.available).toBe(true);
    expect(state.dirty).toBe(false);
    expect(state.apiKeySet).toBe(true);
    expect(state.visionModel.overridden).toBe(true);
    expect(state.visionBaseUrl.overridden).toBe(false);
  });

  it("marks the form dirty only after a real edit", () => {
    const card = new ImagePathifyCardController(async () => sample());
    card.receive(sample());
    const actions = card.inject();
    actions.edit("visionModel", "");
    expect(card.snapshot.getSnapshot().dirty).toBe(false);
    actions.edit("visionModel", "qwen-vl-max");
    expect(card.snapshot.getSnapshot().dirty).toBe(true);
    expect(card.snapshot.getSnapshot().visionModel.overridden).toBe(true);
    actions.discard();
    expect(card.snapshot.getSnapshot().dirty).toBe(false);
    expect(card.snapshot.getSnapshot().visionModel.text).toBe("qwen-vl-plus");
  });

  it("keeps a trailing space on the prefix and restores the default", () => {
    const card = new ImagePathifyCardController(async () => sample());
    card.receive(sample({ prefix: "PATH:" }));
    const actions = card.inject();
    expect(card.snapshot.getSnapshot().prefix.overridden).toBe(true);
    actions.resetField("prefix");
    expect(card.snapshot.getSnapshot().prefix.text).toBe(DEFAULT_PREFIX);
    expect(card.snapshot.getSnapshot().prefix.overridden).toBe(false);
    expect(card.snapshot.getSnapshot().dirty).toBe(true);
  });

  it("treats an emptied endpoint as the default URL", () => {
    const card = new ImagePathifyCardController(async () => sample());
    card.receive(sample({ visionBaseUrl: "https://example.com/v1" }));
    const actions = card.inject();
    actions.edit("visionBaseUrl", "  ");
    expect(card.snapshot.getSnapshot().visionBaseUrl.overridden).toBe(false);
    expect(card.snapshot.getSnapshot().dirty).toBe(true);
  });

  it("does not write a blank API key, and writes the staged key through credentials", async () => {
    const write = vi.fn(async (update) =>
      sample({
        visionModel: update.visionModel ?? sample().visionModel,
      }),
    );
    const credentials = credentialsStub();
    const card = new ImagePathifyCardController(write, credentials);
    card.receive(sample());
    const actions = card.inject();
    actions.edit("apiKey", "   ");
    expect(card.snapshot.getSnapshot().dirty).toBe(false);
    actions.edit("apiKey", "sk-test");
    await card.save();
    expect(write).not.toHaveBeenCalled();
    expect(credentials.store.get(DEFAULT_API_KEY_ENV)).toBe("sk-test");
    expect(card.snapshot.getSnapshot().dirty).toBe(false);
    expect(card.snapshot.getSnapshot().apiKeyText).toBe("");
    expect(card.snapshot.getSnapshot().apiKeySet).toBe(true);
  });

  it("keeps drafts and flags failure when save is refused", async () => {
    const card = new ImagePathifyCardController(async () => {
      throw new Error("nope");
    });
    card.receive(sample());
    const actions = card.inject();
    actions.edit("visionModel", "qwen-vl-max");
    await card.save();
    expect(card.snapshot.getSnapshot().failed).toBe(true);
    expect(card.snapshot.getSnapshot().dirty).toBe(true);
    expect(card.snapshot.getSnapshot().visionModel.text).toBe("qwen-vl-max");
  });

  it("stages model list edits without writing until save", async () => {
    const write = vi.fn(async (update) =>
      sample({ models: update.models ?? [] }),
    );
    const card = new ImagePathifyCardController(write);
    card.receive(sample());
    const actions = card.inject();
    actions.addModel("deepseek-official", "deepseek-v4-flash");
    expect(card.snapshot.getSnapshot().dirty).toBe(true);
    expect(card.snapshot.getSnapshot().models.overridden).toBe(true);
    expect(write).not.toHaveBeenCalled();
    await card.save();
    expect(write).toHaveBeenCalledWith({
      models: [{ provider: "deepseek-official", model: "deepseek-v4-flash" }],
    });
    expect(card.snapshot.getSnapshot().dirty).toBe(false);
  });
});
