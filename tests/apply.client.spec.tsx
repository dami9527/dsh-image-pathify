// @vitest-environment jsdom
/**
 * Client plugin wiring over stubbed services: mounting the imagePathify
 * Remote, registering locale dictionaries, and contributing the Plugins card.
 */
import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";
import { ENTRY_ID, apply, inject } from "../src/client/index.ts";
import { IMAGE_PATHIFY_REMOTE } from "../src/client/remote.ts";
import { NS, en, zh } from "../src/client/locales.ts";
import { STYLE_ID } from "../src/client/styles.ts";
import { defaultPublicSettings } from "../src/contract.ts";
import type {
  ImagePathifyPublicSettings,
  ImagePathifyUpdateStatus,
} from "../src/contract.ts";
import type { ImagePathifyCardState } from "../src/client/card-form.ts";
import { DEFAULT_API_KEY_ENV } from "../src/defaults.ts";

type RemoteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: object } };

interface BootOptions {
  getUpdate?: () => Promise<RemoteResult<ImagePathifyUpdateStatus>>;
  withoutNamespace?: boolean;
  /** `none` = connected host with no credentials wire (must not throw). */
  credentialsWire?: "remote" | "none";
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
  let settings: ImagePathifyPublicSettings = defaultPublicSettings();
  let revision = 1;
  const listeners = new Set<() => void>();
  const mutate = vi.fn(
    async (
      ops: readonly { op: "set"; path: readonly string[]; value: unknown }[],
      seen: number,
    ) => {
      if (seen !== revision) return false;
      const next = { ...settings } as Record<string, unknown>;
      for (const op of ops) {
        const key = op.path[0];
        if (key !== undefined) next[key] = op.value;
      }
      settings = next as unknown as ImagePathifyPublicSettings;
      revision += 1;
      for (const listener of listeners) listener();
      return true;
    },
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
  const credentialListeners = new Map<
    string,
    Array<(...args: never[]) => void>
  >();
  const describeCredentials = vi.fn(async (input: unknown) => {
    const refs = Array.isArray(input)
      ? (input as string[])
      : ((input as { refs?: string[] } | undefined)?.refs ?? []);
    const views = Object.fromEntries(
      refs.map((ref) => [
        ref,
        {
          configured: credentials.has(ref),
          writable: true,
        },
      ]),
    );
    return { ok: true as const, value: views };
  });
  const setCredential = vi.fn(async (ref: string, value: string) => {
    credentials.set(ref, value);
    return { ok: true as const, value: undefined };
  });
  const onRemote = vi.fn(
    (event: string, listener: (...args: never[]) => void) => {
      const bucket = credentialListeners.get(event) ?? [];
      bucket.push(listener);
      credentialListeners.set(event, bucket);
      return () => {
        credentialListeners.set(
          event,
          (credentialListeners.get(event) ?? []).filter(
            (item) => item !== listener,
          ),
        );
      };
    },
  );
  ctx.provide("remote", { $mount: mount, $on: onRemote });
  if (options.withoutNamespace !== true) {
    ctx.provide("remote.imagePathify", { getUpdate });
  }
  ctx.provide("configForms", {
    get: () => ({
      getSnapshot: () => ({
        status: "ready" as const,
        value: settings as unknown as Record<string, unknown>,
        revision,
        writable: true,
      }),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      mutate,
    }),
    whileServed: (_namespaces: readonly string[], register: () => unknown) => {
      register();
      return () => {};
    },
  });
  ctx.provide("slots", { inject: slotsInject, register: slotsRegister });
  ctx.provide("locale", { register: localeRegister, bind });
  if ((options.credentialsWire ?? "remote") === "remote") {
    ctx.provide("remote.credentials", {
      describe: describeCredentials,
      set: setCredential,
    });
  }
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
    mutate,
    getUpdate,
    describeCredentials,
    setCredential,
    credentials,
    onRemote,
    emitCredential(event: string, ref: string) {
      for (const listener of credentialListeners.get(event) ?? []) {
        listener(ref as never);
      }
    },
  };
}

interface RegisteredPluginCard {
  key: string;
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
    (call) => call[0]?.name === "plugins.bundle.config",
  )?.[0] as RegisteredPluginCard | undefined;
  expect(card).toBeDefined();
  return card as RegisteredPluginCard;
}

describe("dsh-image-pathify client apply", () => {
  it("declares the plugins-page services", () => {
    expect(inject).toEqual([
      "slots",
      "locale",
      "remote",
      "remote.credentials",
      "configForms",
    ]);
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
      "plugins.bundle.config",
      expect.any(Function),
    );
    const card = pluginCard(booted);
    expect(card.key).toBe(ENTRY_ID);
    expect(card.locale).toBe(NS);
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

  it("writes staged settings through the entry form on save", async () => {
    const booted = await boot();
    const face = pluginCard(booted).inject();
    face.edit("visionModel", "qwen-vl-max");
    expect(face.hooks.imagePathifyCard.getSnapshot().dirty).toBe(true);
    face.save();
    await expect.poll(() => booted.mutate.mock.calls.length).toBeGreaterThan(0);
    expect(booted.mutate).toHaveBeenCalledWith(
      [{ op: "set", path: ["visionModel"], value: "qwen-vl-max" }],
      1,
    );
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
    expect(booted.setCredential).toHaveBeenCalledWith(
      DEFAULT_API_KEY_ENV,
      "sk-test",
    );
    expect(booted.mutate).not.toHaveBeenCalled();
    expect(face.hooks.imagePathifyCard.getSnapshot().apiKeySet).toBe(true);
    expect(face.hooks.imagePathifyCard.getSnapshot().apiKeyText).toBe("");
  });

  it("still mounts the card when credentials are absent", async () => {
    const booted = await boot({ credentialsWire: "none" });
    expect(pluginCard(booted).key).toBe(ENTRY_ID);
    expect(
      pluginCard(booted).inject().hooks.imagePathifyCard.getSnapshot()
        .available,
    ).toBe(true);
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

  it("refreshes the configured badge from credentials/reference-updated", async () => {
    const booted = await boot();
    const face = pluginCard(booted).inject();
    expect(booted.onRemote).toHaveBeenCalledWith(
      "credentials/reference-updated",
      expect.any(Function),
    );
    expect(booted.onRemote).not.toHaveBeenCalledWith(
      "credentials/updated",
      expect.any(Function),
    );
    expect(face.hooks.imagePathifyCard.getSnapshot().apiKeySet).toBe(false);

    booted.credentials.set(DEFAULT_API_KEY_ENV, "sk-from-file");
    booted.emitCredential("credentials/reference-updated", DEFAULT_API_KEY_ENV);
    await expect
      .poll(() => face.hooks.imagePathifyCard.getSnapshot().apiKeySet)
      .toBe(true);

    booted.credentials.delete(DEFAULT_API_KEY_ENV);
    booted.emitCredential("credentials/reference-updated", DEFAULT_API_KEY_ENV);
    await expect
      .poll(() => face.hooks.imagePathifyCard.getSnapshot().apiKeySet)
      .toBe(false);
  });
});
