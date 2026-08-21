// @vitest-environment jsdom
/**
 * Client plugin wiring over stubbed services: mounting the imagePathify
 * Remote, registering locale dictionaries, and contributing the Plugins card.
 */
import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";
import { apply, inject } from "../src/client/index.ts";
import { IMAGE_PATHIFY_REMOTE } from "../src/client/remote.ts";
import { NS, en, zh } from "../src/client/locales.ts";
import { STYLE_ID } from "../src/client/styles.ts";
import { defaultPublicSettings } from "../src/contract.ts";
import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
  ImagePathifyUpdateStatus,
} from "../src/contract.ts";
import type { ImagePathifyCardState } from "../src/client/card-form.ts";
import { DEFAULT_API_KEY_ENV } from "../src/defaults.ts";

type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: object } };

interface BootOptions {
  getSettings?: () => Promise<RemoteResult<ImagePathifyPublicSettings>>;
  updateSettings?: (
    update: ImagePathifySettingsUpdate,
  ) => Promise<RemoteResult<ImagePathifyPublicSettings>>;
  getUpdate?: () => Promise<RemoteResult<ImagePathifyUpdateStatus>>;
  withoutNamespace?: boolean;
}

async function boot(options: BootOptions = {}) {
  const ctx = new Context();
  const mount = vi.fn(async () => () => {});
  const localeRegister = vi.fn(() => () => {});
  const bind = vi.fn(
    () => (key: string) => (zh as Record<string, string>)[key] ?? key,
  );
  const slotsRegister = vi.fn();
  const slotsInject = vi.fn((_name: string, factory: () => void) => {
    factory();
  });
  let settings = defaultPublicSettings();
  const getSettings = vi.fn(
    options.getSettings ??
      (async () => ({ ok: true as const, value: settings })),
  );
  const updateSettings = vi.fn(
    options.updateSettings ??
      (async (update: ImagePathifySettingsUpdate) => {
        settings = {
          ...settings,
          ...(update.visionModel !== undefined
            ? { visionModel: update.visionModel }
            : {}),
          ...(update.relaxAdmission !== undefined
            ? { relaxAdmission: update.relaxAdmission }
            : {}),
        };
        return { ok: true as const, value: settings };
      }),
  );
  const getUpdate = vi.fn(
    options.getUpdate ??
      (async () => ({
        ok: true as const,
        value: {
          installedVersion: "0.1.1",
          latestVersion: "0.1.1",
          updateAvailable: false,
          command: "dsh plugin --profile web add dsh-image-pathify@0.1.1",
        },
      })),
  );
  const credentials = new Map<string, string>();
  const describeCredentials = vi.fn(async ({ refs }: { refs: string[] }) => ({
    result: {
      ok: true as const,
      value: {
        credentials: Object.fromEntries(
          refs.map((ref) => [
            ref,
            {
              configured: credentials.has(ref),
              writable: true,
            },
          ]),
        ),
      },
    },
  }));
  const setCredential = vi.fn(
    async ({ ref, value }: { ref: string; value: string }) => {
      credentials.set(ref, value);
      return { result: { ok: true as const, value: {} } };
    },
  );
  ctx.provide("remote", { $mount: mount, $on: vi.fn(() => () => {}) });
  if (options.withoutNamespace !== true) {
    ctx.provide("remote.imagePathify", {
      getSettings,
      updateSettings,
      getUpdate,
    });
  }
  ctx.provide("slots", { inject: slotsInject, register: slotsRegister });
  ctx.provide("locale", { register: localeRegister, bind });
  ctx.provide("connection", {
    api: {
      credentials: { describe: describeCredentials, set: setCredential },
    },
  });
  apply(ctx as never);
  await Promise.resolve();
  await Promise.resolve();
  return {
    ctx,
    mount,
    localeRegister,
    bind,
    slotsRegister,
    slotsInject,
    getSettings,
    updateSettings,
    getUpdate,
    describeCredentials,
    setCredential,
  };
}

interface RegisteredPluginCard {
  key: string;
  id: string;
  order: number;
  locale: string;
  inject: () => {
    hooks: {
      imagePathifyCard: { getSnapshot: () => ImagePathifyCardState };
    };
    edit: (field: string, text: string) => void;
    save: () => void;
  };
}

function pluginCard(
  booted: Awaited<ReturnType<typeof boot>>,
): RegisteredPluginCard {
  const card = booted.slotsRegister.mock.calls.find(
    (call) => call[0]?.name === "settings.plugin.item",
  )?.[0] as RegisteredPluginCard | undefined;
  expect(card).toBeDefined();
  return card as RegisteredPluginCard;
}

describe("dsh-image-pathify client apply", () => {
  it("declares slots, locale, connection, and remote", () => {
    expect(inject).toEqual(["slots", "locale", "connection", "remote"]);
  });

  it("registers complete zh and en dictionaries", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    expect(NS).toBe("image-pathify");
  });

  it("mounts the Remote, injects styles, and registers the Plugins card", async () => {
    const booted = await boot();
    expect(booted.mount).toHaveBeenCalledWith(IMAGE_PATHIFY_REMOTE);
    expect(booted.localeRegister).toHaveBeenCalledWith(NS, { zh, en });
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    expect(booted.slotsInject).toHaveBeenCalledWith(
      "settings.plugin.item",
      expect.any(Function),
    );
    const card = pluginCard(booted);
    expect(card.key).toBe(NS);
    expect(card.id).toBe(NS);
    expect(card.order).toBe(30);
    expect(card.locale).toBe(NS);
    expect(booted.getSettings).toHaveBeenCalled();
    expect(card.inject().hooks.imagePathifyCard.getSnapshot().available).toBe(
      true,
    );
    await expect
      .poll(
        () =>
          card.inject().hooks.imagePathifyCard.getSnapshot().installedVersion,
      )
      .toBe("0.1.1");
    expect(card.inject().hooks.imagePathifyCard.getSnapshot().update).toBe(
      undefined,
    );
  });

  it("writes staged settings through the Remote on save", async () => {
    const booted = await boot();
    const face = pluginCard(booted).inject();
    face.edit("visionModel", "qwen-vl-max");
    expect(face.hooks.imagePathifyCard.getSnapshot().dirty).toBe(true);
    face.save();
    await expect
      .poll(() => booted.updateSettings.mock.calls.length)
      .toBeGreaterThan(0);
    expect(booted.updateSettings).toHaveBeenCalledWith({
      visionModel: "qwen-vl-max",
    });
    expect(face.hooks.imagePathifyCard.getSnapshot().dirty).toBe(false);
    expect(face.hooks.imagePathifyCard.getSnapshot().visionModel.text).toBe(
      "qwen-vl-max",
    );
  });

  it("writes a staged API key through credentials, not the settings Remote", async () => {
    const booted = await boot();
    const face = pluginCard(booted).inject();
    face.edit("apiKey", "sk-test");
    face.save();
    await expect
      .poll(() => booted.setCredential.mock.calls.length)
      .toBeGreaterThan(0);
    expect(booted.setCredential).toHaveBeenCalledWith({
      ref: DEFAULT_API_KEY_ENV,
      value: "sk-test",
    });
    expect(booted.updateSettings).not.toHaveBeenCalled();
    expect(face.hooks.imagePathifyCard.getSnapshot().apiKeySet).toBe(true);
    expect(face.hooks.imagePathifyCard.getSnapshot().apiKeyText).toBe("");
  });

  it("surfaces an available update on the card header snapshot", async () => {
    const booted = await boot({
      getUpdate: async () => ({
        ok: true,
        value: {
          installedVersion: "0.1.0",
          latestVersion: "0.1.1",
          updateAvailable: true,
          command: "dsh plugin --profile web add dsh-image-pathify@0.1.1",
        },
      }),
    });
    await expect
      .poll(
        () =>
          pluginCard(booted).inject().hooks.imagePathifyCard.getSnapshot()
            .update,
      )
      .toEqual({
        installedVersion: "0.1.0",
        latestVersion: "0.1.1",
        command: "dsh plugin --profile web add dsh-image-pathify@0.1.1",
      });
    expect(
      pluginCard(booted).inject().hooks.imagePathifyCard.getSnapshot()
        .installedVersion,
    ).toBe("0.1.0");
    expect(booted.getUpdate).toHaveBeenCalled();
  });
});
