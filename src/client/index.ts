/**
 * dsh-image-pathify client plugin: registers the Vision card on the plugin
 * bundle page (above the row list), locale dictionaries, and the update probe.
 * Components never see `ctx`.
 */
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type {} from "@deepseek-ai/dsh-client-connection/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import {
  publicSettingsSchema,
  type ImagePathifyPublicSettings,
  type ImagePathifySettingsUpdate,
  type ImagePathifyUpdateStatus,
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

/** Loader entry id. Also the `plugins.bundle.config` slot key. */
export const ENTRY_ID = "dsh-image-pathify";

/** Required services: slots, locale, the entry form, credentials, and the probe. */
export const inject = [
  "slots",
  "locale",
  "connection",
  "remote",
  "remote.credentials",
  "configForms",
];

/** The mounted imagePathify namespace service's callable face. */
interface ImagePathifyNamespaceFace {
  getUpdate(): Promise<
    | { ok: true; value: ImagePathifyUpdateStatus }
    | { ok: false; error: { code: string; message: string; details: object } }
  >;
}

/**
 * Compose the Vision card on the installed-plugin page, above the row list.
 * The page does not pass a form; this plugin reads `configForms` itself.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  adoptStyles();
  ctx.effect(
    () => ctx.locale.register(NS, { zh, en }),
    "dsh-image-pathify: dictionaries",
  );

  const form = ctx.configForms.get(ENTRY_ID);
  let remote: ImagePathifyNamespaceFace | undefined;
  let settingsTail: Promise<void> = Promise.resolve();

  const readForm = (): ImagePathifyPublicSettings | undefined => {
    const snapshot = form.getSnapshot();
    if (snapshot.status !== "ready") return undefined;
    try {
      return publicSettingsSchema.parse(snapshot.value);
    } catch (error) {
      console.error("[dsh-image-pathify] settings read failed:", error);
      return undefined;
    }
  };

  const publishForm = (): void => {
    const value = readForm();
    if (value === undefined) {
      if (form.getSnapshot().status === "unavailable") card.markUnavailable();
      return;
    }
    card.receive(value);
  };

  const updateSettings = (
    update: ImagePathifySettingsUpdate,
  ): Promise<ImagePathifyPublicSettings> => {
    const operation = settingsTail.then(async () => {
      const snapshot = form.getSnapshot();
      const ops = Object.entries(update)
        .filter((entry) => entry[1] !== undefined)
        .map(([key, value]) => ({ op: "set" as const, path: [key], value }));
      if (ops.length > 0) {
        const ok = await form.mutate(ops, snapshot.revision);
        if (!ok) {
          const error = new Error("settings update was refused");
          console.error("[dsh-image-pathify] settings update failed:", error);
          throw error;
        }
      }
      const next = readForm();
      if (next === undefined) {
        throw new Error("settings update was refused");
      }
      return next;
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
  ctx.effect(() => form.subscribe(publishForm), "dsh-image-pathify: config");
  publishForm();

  ctx.effect(() => {
    const onUpdated = ctx.remote.$on;
    if (typeof onUpdated !== "function") return;
    const refresh = ((ref: string) => {
      card.refreshCredential(ref);
    }) as (...args: never[]) => void;
    return onUpdated.call(ctx.remote, "credentials/reference-updated", refresh);
  }, "dsh-image-pathify: credential invalidations");

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
    void loadUpdate();
    return () => {
      remote = undefined;
      void dispose();
    };
  }, "dsh-image-pathify: remote");

  ctx.on("connection/reset", () => {
    publishForm();
    void loadUpdate();
  });

  ctx.configForms.whileServed([ENTRY_ID], () =>
    ctx.slots.inject("plugins.bundle.config", () =>
      ctx.slots.register(
        {
          name: "plugins.bundle.config",
          key: ENTRY_ID,
          locale: NS,
          inject: (): ImagePathifyCardInjected => card.inject(),
        },
        ImagePathifyCard,
      ),
    ),
  );
}
