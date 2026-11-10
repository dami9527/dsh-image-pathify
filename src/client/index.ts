/**
 * dsh-image-pathify client plugin: registers the Vision card on the plugin
 * bundle page (above the row list), locale dictionaries, and the update probe.
 * Components never see `ctx`.
 */
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import {
  publicSettingsSchema,
  type ImagePathifyPublicSettings,
  type ImagePathifySettingsUpdate,
} from "../contract.ts";
import { ImagePathifyCardController } from "./card-form.ts";
import {
  ImagePathifyCard,
  type ImagePathifyCardInjected,
} from "./ImagePathifyCard.tsx";
import { liveCredentials } from "./credentials-api.ts";
import { NS, en, zh } from "./locales.ts";
import { adoptStyles } from "./styles.ts";

/** Loader entry id. Also the `plugins.bundle.config` slot key. */
export const ENTRY_ID = "dsh-image-pathify";

/** Required services: slots, locale, the entry form, and credentials. */
export const inject = [
  "slots",
  "locale",
  "remote",
  "remote.credentials",
  "configForms",
];

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

  ctx.on("connection/reset", () => {
    publishForm();
  });

  ctx.effect(
    () =>
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
      ),
    "dsh-image-pathify: page",
  );
}
