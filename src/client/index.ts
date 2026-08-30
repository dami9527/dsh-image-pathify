/**
 * dsh-image-pathify client plugin: registers the Vision card on the Plugins
 * settings page, locale dictionaries, and the plugin-owned settings Remote.
 * Components never see `ctx`.
 */
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-connection/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
// Type-only: the keyed `settings.plugin.item` slot declaration.
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {
  ImagePathifyPublicSettings,
  ImagePathifySettingsUpdate,
  ImagePathifyUpdateStatus,
} from "../contract.ts";
import { ImagePathifyCardController } from "./card-form.ts";
import {
  ImagePathifyCard,
  type ImagePathifyCardInjected,
} from "./ImagePathifyCard.tsx";
import { liveCredentials } from "./credentials-api.ts";
import { NS, en, zh } from "./locales.ts";
import { IMAGE_PATHIFY_REMOTE } from "./remote.ts";
import { adoptStyles } from "./styles.ts";

/** Required services: slots, locale, credentials wire, and the Remote carrier. */
export const inject = ["slots", "locale", "connection", "remote"];

/** The mounted imagePathify namespace service's callable face. */
interface ImagePathifyNamespaceFace {
  getSettings(): Promise<
    | { ok: true; value: ImagePathifyPublicSettings }
    | { ok: false; error: { code: string; message: string; details: object } }
  >;
  updateSettings(
    update: ImagePathifySettingsUpdate,
  ): Promise<
    | { ok: true; value: ImagePathifyPublicSettings }
    | { ok: false; error: { code: string; message: string; details: object } }
  >;
  getUpdate(): Promise<
    | { ok: true; value: ImagePathifyUpdateStatus }
    | { ok: false; error: { code: string; message: string; details: object } }
  >;
}

/**
 * Compose the Vision plugin card under Settings → Plugins.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  adoptStyles();
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "dsh-image-pathify: dictionaries",
  );

  let settingsGeneration = 0;
  let settingsTail: Promise<void> = Promise.resolve();
  let remote: ImagePathifyNamespaceFace | undefined;

  const reportSettingsError = (
    operation: "read" | "update",
    error: { code: string; message: string } | unknown,
  ): void => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "message" in error
    ) {
      const remoteError = error as { code: string; message: string };
      console.error(
        `[dsh-image-pathify] settings ${operation} failed: ${remoteError.code}: ${remoteError.message}`,
      );
      return;
    }
    console.error(`[dsh-image-pathify] settings ${operation} failed:`, error);
  };

  const updateSettings = (
    update: ImagePathifySettingsUpdate,
  ): Promise<ImagePathifyPublicSettings> => {
    const operation = settingsTail.then(async () => {
      const handle = remote;
      if (handle === undefined) {
        const error = new Error("the imagePathify Remote is not mounted");
        reportSettingsError("update", error);
        throw error;
      }
      const generation = ++settingsGeneration;
      try {
        const result = await handle.updateSettings(update);
        if (remote !== handle || generation !== settingsGeneration) {
          throw new Error("settings update was superseded");
        }
        if (!result.ok) {
          reportSettingsError("update", result.error);
          throw new Error(`${result.error.code}: ${result.error.message}`);
        }
        return result.value;
      } catch (error) {
        if (remote === handle && generation === settingsGeneration) {
          reportSettingsError("update", error);
        }
        throw error;
      }
    });
    settingsTail = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  const card = new ImagePathifyCardController(
    updateSettings,
    liveCredentials(ctx),
  );
  // 0.1.2 mounts credentials as `remote.credentials`. Nested inject waits for
  // it without blocking older hosts that never provide that service.
  ctx.inject(["remote.credentials"], () => {
    card.refreshCredential();
  });

  ctx.effect(() => {
    const onUpdated = ctx.remote.$on;
    if (typeof onUpdated !== "function") return;
    const refresh = ((ref: string) => {
      card.refreshCredential(ref);
    }) as (...args: never[]) => void;
    // 0.1.1-rc.1 renamed the forwarded Host event. Subscribe to both so a
    // live yaml/`set` still refreshes the "configured" badge on older hosts.
    const offReference = onUpdated.call(
      ctx.remote,
      "credentials/reference-updated",
      refresh,
    );
    const offLegacy = onUpdated.call(
      ctx.remote,
      "credentials/updated",
      refresh,
    );
    return () => {
      offReference();
      offLegacy();
    };
  }, "dsh-image-pathify: credential invalidations");

  const loadSettings = async (): Promise<void> => {
    const handle = remote;
    if (handle === undefined) return;
    const generation = ++settingsGeneration;
    try {
      const result = await handle.getSettings();
      if (remote !== handle || generation !== settingsGeneration) return;
      if (!result.ok) {
        reportSettingsError("read", result.error);
        card.markUnavailable();
        return;
      }
      card.receive(result.value);
    } catch (error) {
      if (remote === handle && generation === settingsGeneration) {
        reportSettingsError("read", error);
        card.markUnavailable();
      }
    }
  };

  const loadUpdate = async (): Promise<void> => {
    const handle = remote;
    if (handle === undefined) return;
    try {
      const result = await handle.getUpdate();
      if (remote !== handle) return;
      if (!result.ok) return;
      card.receiveUpdate(result.value);
    } catch {
      // Probe failures stay silent: the card simply has no header banner.
    }
  };

  ctx.effect(async () => {
    const dispose = await ctx.remote.$mount(IMAGE_PATHIFY_REMOTE);
    remote = (ctx.reflect as unknown as { get(name: string): unknown }).get(
      "remote.imagePathify",
    ) as ImagePathifyNamespaceFace | undefined;
    if (remote === undefined) {
      throw new Error(
        "dsh-image-pathify: the imagePathify Remote namespace did not mount",
      );
    }
    await loadSettings();
    void loadUpdate();
    return () => {
      settingsGeneration += 1;
      remote = undefined;
      card.markUnavailable();
      void dispose();
    };
  }, "dsh-image-pathify: remote");

  ctx.on("connection/reset", () => {
    void loadSettings();
    void loadUpdate();
  });

  // 0.1.1-rc.5/rc.6 declare a list slot (id/order); 0.1.1-rc.7+ is keyed on the
  // settings namespace. Extra fields are ignored by the other kind.
  ctx.slots.inject("settings.plugin.item", () =>
    ctx.slots.register(
      {
        name: "settings.plugin.item",
        key: NS,
        id: NS,
        order: 30,
        locale: NS,
        inject: (): ImagePathifyCardInjected => card.inject(),
      },
      ImagePathifyCard,
    ),
  );
}
